import { Prisma, type OrderStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { toSkipTake } from '../../utils/validation.js';
import { generateOrderNumber } from '../../utils/order-number.js';
import { stallOpenState } from '../catalog/catalog.mappers.js';
import { ACTIVE_STATUSES, ORDER_STATUS_LABELS, nextStatusesFor } from './order-status.js';
import { hasBankAccount, paymentsService } from '../payments/payments.service.js';
import { transferContentFor } from '../payments/vietqr.js';
import { orderDetailInclude, orderSummarySelect, toOrderDto, toOrderSummary } from './orders.mapper.js';
import { validatePickupTime } from './pickup-slots.js';
import type { CreateOrderInput, ListOrdersQuery } from './orders.schemas.js';

/** Phí dịch vụ hiện tại (VND). Để 0 ở phiên bản đầu; tính ở server, không nhận từ client */
const SERVICE_FEE = new Prisma.Decimal(0);

const GROUP_STATUSES: Record<NonNullable<ListOrdersQuery['group']>, OrderStatus[]> = {
  active: ACTIVE_STATUSES,
  completed: ['COMPLETED'],
  cancelled: ['CANCELLED', 'REJECTED'],
};

/** Lỗi từ chối tạo đơn, kèm chi tiết để giao diện hiển thị */
const reject = (message: string, details?: unknown) => new AppError(422, 'ORDER_REJECTED', message, details);

/**
 * Gửi lại cùng idempotencyKey phải là CÙNG yêu cầu. Nếu điểm nhận / giờ nhận / cách thanh toán khác đơn đã tạo
 * (vd mạng chập chờn, sinh viên đổi sang cơ sở khác rồi bấm lại) thì báo rõ thay vì lặng lẽ trả đơn cũ —
 * tránh sinh viên tưởng đã đặt ở nơi mới trong khi quầy giao tới nơi cũ.
 */
function assertSameRequest(
  order: { id: number; orderNumber: string; pickupLocationId: number; pickupTime: Date | null; paymentMethod: string; pickupLocation: { name: string } },
  input: CreateOrderInput,
) {
  const wantTime = input.pickupTime ? new Date(input.pickupTime).getTime() : null;
  const field =
    order.pickupLocationId !== input.pickupLocationId ? 'pickupLocationId'
    : (order.pickupTime?.getTime() ?? null) !== wantTime ? 'pickupTime'
    : order.paymentMethod !== input.paymentMethod ? 'paymentMethod'
    : null;
  if (!field) return;
  const message = `Đơn ${order.orderNumber} đã được đặt trước đó (nhận tại "${order.pickupLocation.name}"). Không thể đổi khi gửi lại — hãy xem đơn đó, huỷ nếu cần rồi đặt lại.`;
  throw new AppError(409, 'ORDER_ALREADY_PLACED', message, [{ field, message, orderId: order.id }]);
}

async function findOwnOrder(studentId: number, idempotencyKey: string) {
  return prisma.order.findUnique({
    where: { studentId_idempotencyKey: { studentId, idempotencyKey } },
    include: orderDetailInclude,
  });
}

export const ordersService = {
  /**
   * Tạo đơn từ giỏ hàng của sinh viên, trong MỘT transaction:
   * đọc giỏ & giá từ DB → kiểm tra → tính tiền ở server → tạo đơn, món (snapshot), thanh toán,
   * lịch sử trạng thái, thông báo → xoá giỏ. Lỗi ở bất kỳ bước nào sẽ huỷ toàn bộ.
   *
   * Trả về { order, created }. created = false khi gửi lại cùng idempotencyKey (không tạo đơn trùng).
   */
  async create(studentId: number, input: CreateOrderInput) {
    const existing = await findOwnOrder(studentId, input.idempotencyKey);
    if (existing) {
      assertSameRequest(existing, input);
      return { order: toOrderDto(existing), created: false };
    }

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Khoá giỏ hàng của sinh viên: hai lần checkout đồng thời (kể cả khác idempotencyKey)
          // phải chờ nhau; lần sau sẽ thấy giỏ đã trống thay vì tạo đơn thứ hai.
          await tx.$queryRaw`SELECT id FROM carts WHERE userId = ${studentId} FOR UPDATE`;

          // Kiểm tra lại sau khi đã khoá: request trùng khoá vừa tạo đơn xong thì trả lại đơn đó
          const duplicate = await tx.order.findUnique({
            where: { studentId_idempotencyKey: { studentId, idempotencyKey: input.idempotencyKey } },
            select: { id: true, orderNumber: true, pickupLocationId: true, pickupTime: true, paymentMethod: true, pickupLocation: { select: { name: true } } },
          });
          if (duplicate) {
            assertSameRequest(duplicate, input);
            return { id: duplicate.id, created: false };
          }

          const cart = await tx.cart.findUnique({
            where: { userId: studentId },
            include: {
              items: {
                include: { menuItem: { include: { stall: true, category: { select: { isActive: true } } } } },
                orderBy: { createdAt: 'asc' },
              },
            },
          });
          const rows = cart?.items ?? [];
          if (rows.length === 0) throw reject('Giỏ hàng đang trống');

          // 1 đơn = 1 quầy
          const stall = rows[0]!.menuItem.stall;
          if (rows.some((r) => r.menuItem.stallId !== stall.id)) {
            throw reject('Giỏ hàng có món của nhiều quầy. Mỗi đơn chỉ được đặt món của một quầy.');
          }

          const { isOpenNow, canOrderNow } = stallOpenState(stall);
          if (!canOrderNow) {
            throw reject(isOpenNow ? 'Quầy đang tạm ngưng nhận đơn' : `Quầy hiện đã đóng cửa (mở cửa ${stall.openTime} – ${stall.closeTime})`);
          }

          const unavailable = rows.filter((r) => !r.menuItem.isActive || !r.menuItem.isAvailable || !r.menuItem.category.isActive);
          if (unavailable.length > 0) {
            throw reject(`Một số món đã hết hoặc ngừng bán: ${unavailable.map((r) => r.menuItem.name).join(', ')}`, {
              unavailableItems: unavailable.map((r) => ({ cartItemId: r.id, menuItemId: r.menuItemId, name: r.menuItem.name })),
            });
          }

          const byTransfer = input.paymentMethod === 'VIETQR';
          if (byTransfer && !hasBankAccount(stall)) {
            throw reject('Quầy này chưa nhận thanh toán chuyển khoản. Vui lòng chọn trả tiền mặt khi nhận món.', [
              { field: 'paymentMethod', message: 'Quầy chưa cài đặt tài khoản nhận tiền' },
            ]);
          }

          const pickup = await tx.campusPickupLocation.findFirst({ where: { id: input.pickupLocationId, isActive: true } });
          if (!pickup) throw reject('Điểm nhận món không hợp lệ hoặc đã ngừng hoạt động', [{ field: 'pickupLocationId', message: 'Vui lòng chọn điểm nhận khác' }]);

          let pickupTime: Date | null = null;
          if (input.pickupTime) {
            pickupTime = new Date(input.pickupTime);
            const error = validatePickupTime(pickupTime, stall);
            if (error) throw reject(error, [{ field: 'pickupTime', message: error }]);
          }

          // Tính tiền hoàn toàn ở server từ giá trong DB
          const lines = rows.map((r) => ({
            menuItemId: r.menuItemId,
            itemName: r.menuItem.name,
            unitPrice: r.menuItem.price,
            quantity: r.quantity,
            note: r.note,
            lineTotal: r.menuItem.price.mul(r.quantity),
          }));
          const subtotal = lines.reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0));
          const discount = new Prisma.Decimal(0);
          const total = subtotal.add(SERVICE_FEE).sub(discount);

          // Mã đơn ngẫu nhiên; thử lại nếu (rất hiếm) bị trùng
          let orderNumber = generateOrderNumber();
          for (let i = 0; i < 5 && (await tx.order.findUnique({ where: { orderNumber }, select: { id: true } })); i++) {
            orderNumber = generateOrderNumber();
          }

          const order = await tx.order.create({
            data: {
              orderNumber,
              studentId,
              stallId: stall.id,
              pickupLocationId: pickup.id,
              status: 'PENDING',
              paymentMethod: input.paymentMethod,
              paymentStatus: 'UNPAID',
              subtotal,
              serviceFee: SERVICE_FEE,
              discount,
              total,
              customerNote: input.customerNote ?? null,
              pickupTime,
              idempotencyKey: input.idempotencyKey,
              items: { create: lines },
              payment: {
                create: {
                  method: input.paymentMethod,
                  status: 'UNPAID',
                  amount: total,
                  // Chuyển khoản: chụp lại tài khoản nhận tiền của quầy + nội dung CK + hạn thanh toán
                  ...(byTransfer && {
                    transferContent: transferContentFor(orderNumber),
                    bankBin: stall.bankBin,
                    bankAccountNo: stall.bankAccountNo,
                    bankAccountName: stall.bankAccountName,
                    expiresAt: new Date(Date.now() + stall.paymentTimeoutMinutes * 60_000),
                  }),
                },
              },
              statusHistory: { create: { toStatus: 'PENDING', changedById: studentId, note: 'Sinh viên đặt đơn' } },
            },
          });

          // Thông báo cho sinh viên và toàn bộ nhân viên của quầy
          const staff = await tx.vendorMembership.findMany({ where: { stallId: stall.id }, select: { userId: true } });
          await tx.notification.createMany({
            data: [
              {
                userId: studentId,
                orderId: order.id,
                type: 'ORDER_STATUS',
                title: `Đặt món thành công: ${orderNumber}`,
                message: byTransfer
                  ? `Vui lòng chuyển khoản trong ${stall.paymentTimeoutMinutes} phút để ${stall.name} nhận đơn, quá hạn đơn sẽ tự huỷ.`
                  : `Đơn của bạn tại ${stall.name} đang chờ quầy xác nhận.`,
              },
              ...staff.map((s) => ({
                userId: s.userId,
                orderId: order.id,
                type: 'ORDER_STATUS' as const,
                title: `Đơn mới: ${orderNumber}`,
                message: `${lines.reduce((n, l) => n + l.quantity, 0)} phần — tổng ${new Intl.NumberFormat('vi-VN').format(total.toNumber())}đ. ${
                  byTransfer ? 'Đang chờ sinh viên chuyển khoản.' : 'Vui lòng xác nhận.'
                }`,
              })),
            ],
          });

          await tx.cartItem.deleteMany({ where: { cartId: cart!.id } });
          return { id: order.id, created: true };
        },
        { timeout: 15_000 },
      );

      const order = await prisma.order.findUniqueOrThrow({ where: { id: result.id }, include: orderDetailInclude });
      return { order: toOrderDto(order), created: result.created };
    } catch (error) {
      // Hai request cùng idempotencyKey gửi đồng thời: request sau vi phạm UNIQUE → trả lại đơn đã tạo
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await findOwnOrder(studentId, input.idempotencyKey);
        if (duplicate) {
          assertSameRequest(duplicate, input);
          return { order: toOrderDto(duplicate), created: false };
        }
      }
      throw error;
    }
  },

  async listForStudent(studentId: number, query: ListOrdersQuery) {
    const where: Prisma.OrderWhereInput = { studentId, ...(query.group && { status: { in: GROUP_STATUSES[query.group] } }) };
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, select: orderSummarySelect, orderBy: { createdAt: 'desc' }, ...toSkipTake(query) }),
      prisma.order.count({ where }),
    ]);
    return { orders: orders.map(toOrderSummary), total };
  },

  /** Sinh viên chỉ xem được đơn của mình. Đơn của người khác trả 404 (không lộ là có tồn tại) */
  async detailForStudent(studentId: number, orderId: number) {
    // Hết hạn chuyển khoản thì huỷ ngay khi xem, không chờ tác vụ định kỳ
    await paymentsService.expireUnpaidOrders({ orderId });
    const order = await prisma.order.findFirst({ where: { id: orderId, studentId }, include: orderDetailInclude });
    if (!order) throw AppError.notFound('Không tìm thấy đơn hàng');
    return toOrderDto(order);
  },

  /** Sinh viên huỷ đơn: chỉ khi đơn còn PENDING (quầy chưa nhận) */
  async cancelByStudent(studentId: number, orderId: number, reason?: string) {
    const order = await prisma.order.findFirst({ where: { id: orderId, studentId }, include: { stall: { select: { name: true } } } });
    if (!order) throw AppError.notFound('Không tìm thấy đơn hàng');
    if (order.status === 'PENDING' && order.paymentStatus === 'PAID') {
      throw AppError.unprocessable('Đơn đã thanh toán chuyển khoản nên không tự huỷ được. Vui lòng liên hệ quầy để huỷ và được hoàn tiền.');
    }
    if (!nextStatusesFor(order, 'STUDENT_OWNER').includes('CANCELLED')) {
      throw AppError.unprocessable(
        `Không thể huỷ đơn đang ở trạng thái "${ORDER_STATUS_LABELS[order.status]}". Đơn chỉ huỷ được khi quầy chưa xác nhận; vui lòng liên hệ quầy.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // Cập nhật có điều kiện: nếu quầy vừa nhận đơn cùng lúc thì không huỷ nữa
      // Thêm điều kiện thanh toán: tiền chuyển khoản vừa về thì không huỷ nữa
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: order.status, paymentStatus: order.paymentStatus },
        data: { status: 'CANCELLED', paymentStatus: 'VOIDED', cancelReason: reason || 'Sinh viên huỷ đơn', cancelledAt: new Date() },
      });
      if (count === 0) throw AppError.conflict('Trạng thái đơn vừa thay đổi, vui lòng tải lại trang');

      await tx.payment.updateMany({ where: { orderId: order.id }, data: { status: 'VOIDED' } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: order.status, toStatus: 'CANCELLED', changedById: studentId, note: reason || 'Sinh viên huỷ đơn' },
      });
      const staff = await tx.vendorMembership.findMany({ where: { stallId: order.stallId }, select: { userId: true } });
      if (staff.length > 0) {
        await tx.notification.createMany({
          data: staff.map((s) => ({
            userId: s.userId,
            orderId: order.id,
            type: 'ORDER_STATUS' as const,
            title: `Đơn ${order.orderNumber} đã bị huỷ`,
            message: `Sinh viên đã huỷ đơn${reason ? `: ${reason}` : '.'}`,
          })),
        });
      }
    });

    return this.detailForStudent(studentId, orderId);
  },
};
