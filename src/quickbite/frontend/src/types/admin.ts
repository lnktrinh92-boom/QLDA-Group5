import type { AccountStatus, Role, User } from '@/features/auth/types';
import type { Money, OrderStatus, PaymentStatus, Rating } from './models';
import type { SalesReport } from './vendor';

export interface AdminDashboard {
  date: string;
  users: { total: number; byRole: Partial<Record<Role, number>>; suspended: number };
  stalls: { active: number; inactive: number };
  orders: { today: number; active: number; last30Days: Partial<Record<OrderStatus, number>> };
  revenue: { today: Money; last30Days: Money; completedLast30Days: number };
  series: SalesReport['series'];
  topStalls: { stallId: number; name: string; orders: number; revenue: Money }[];
  reportedReviews: number;
}

export interface AdminUserDetail extends User {
  lastLoginAt: string | null;
  orderCount: number;
}

export interface UserInput {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  phone?: string | null;
  studentCode?: string | null;
}

export interface UserUpdateInput {
  fullName?: string;
  phone?: string | null;
  studentCode?: string | null;
  role?: Role;
  status?: AccountStatus;
}

export interface StallMember {
  id: number;
  role: 'OWNER' | 'STAFF';
  userId: number;
  user: { id: number; fullName: string; email: string; status: AccountStatus };
}

export interface AdminStall {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  location: string;
  phone: string | null;
  openTime: string;
  closeTime: string;
  isActive: boolean;
  isAcceptingOrders: boolean;
  isOpenNow: boolean;
  canOrderNow: boolean;
  rating: Rating;
  memberships: StallMember[];
  _count: { menuItems: number; orders: number };
}

export interface StallInput {
  name: string;
  slug?: string;
  description?: string | null;
  location: string;
  phone?: string | null;
  openTime: string;
  closeTime: string;
  imageUrl?: string | null;
  isActive: boolean;
  /** Chỉ khi tạo quầy: gán chủ quầy ngay */
  ownerEmail?: string;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
}

export interface AdminPickupLocation {
  id: number;
  name: string;
  building: string | null;
  description: string | null;
  isActive: boolean;
  orderCount: number;
}

export interface AdminOrderRow {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: Money;
  createdAt: string;
  stall: { id: number; name: string };
  student: { id: number; fullName: string; email: string };
  _count: { items: number };
  nextStatuses: OrderStatus[];
}

export type ReviewStatus = 'VISIBLE' | 'HIDDEN' | 'REPORTED';

export interface AdminReview {
  id: number;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  reportReason: string | null;
  createdAt: string;
  updatedAt: string;
  student: { id: number; fullName: string; email: string };
  stall: { id: number; name: string };
  order: { id: number; orderNumber: string };
}

export interface AuditLog {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: number; fullName: string; email: string } | null;
}
