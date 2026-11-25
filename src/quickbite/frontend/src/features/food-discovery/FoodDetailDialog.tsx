import { useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { useAddToCartAction } from '@/features/cart/use-add-to-cart-action';
import type { MenuItem } from '@/types/models';
import { FoodDetailContent } from './FoodDetailContent';
import type { QuickAdd } from './FoodCard';

/**
 * Quản lý hộp thoại chi tiết món cho một trang:
 *   const detail = useFoodDetailDialog();
 *   <FoodCard onSelect={detail.open} />  ...  {detail.dialog}
 */
export function useFoodDetailDialog() {
  const [item, setItem] = useState<MenuItem | null>(null);
  const close = () => setItem(null);
  const cart = useAddToCartAction(close);

  const dialog = (
    <>
      <Dialog open={item !== null} onClose={close} title={item?.name ?? 'Chi tiết món'} hideTitle>
        {item && (
          <>
            {/* key: mỗi món có số lượng / ghi chú riêng */}
            <FoodDetailContent
              key={item.id}
              item={item}
              onAddToCart={(input) => cart.handleAdd(item, input)}
              adding={cart.adding}
              blockedReason={cart.blockedReason}
              onNavigate={close}
            />
            <div className="border-t border-gray-100 px-6 py-3 text-right">
              <Link to={`/mon-an/${item.id}`} onClick={close} className="inline-flex items-center gap-1 text-sm font-medium text-navy-500 hover:text-brand-600">
                Xem trang chi tiết <ExternalLink className="size-3.5" aria-hidden />
              </Link>
            </div>
          </>
        )}
      </Dialog>
      {cart.confirmDialog}
    </>
  );

  // Nút "+" trên thẻ món: thêm 1 phần không ghi chú (Design QA UI-01). Ẩn với tài khoản không được đặt món.
  const quickAdd: QuickAdd | undefined = cart.blockedReason
    ? undefined
    : { onAdd: (menuItem) => cart.handleAdd(menuItem, { quantity: 1, note: '' }), busy: cart.adding };

  return { open: setItem, close, dialog, quickAdd };
}
