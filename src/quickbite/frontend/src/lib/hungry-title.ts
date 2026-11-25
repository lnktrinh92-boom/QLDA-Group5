import type { User } from '@/features/auth/types';

/**
 * Lời mời đặt món cuối trang chủ. Chỉ gọi tên với tài khoản sinh viên (tên riêng = tiếng cuối của họ tên);
 * tài khoản quầy / quản trị có tên như "Quản trị viên QuickBite" thì dùng câu chung (rà soát câu chữ VN-01).
 */
export function hungryTitle(user: Pick<User, 'role' | 'fullName'>) {
  const givenName = user.fullName.trim().split(/\s+/).pop();
  return user.role === 'STUDENT' && givenName ? `Đói rồi phải không, ${givenName}?` : 'Đói rồi phải không bạn ơi?';
}
