import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  Bell,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Store,
  User as UserIcon,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { MiniCart } from '@/features/cart/MiniCart';
import { useUnreadCount } from '@/features/notifications/hooks';
import { toast } from 'sonner';
import { Logo } from './Logo';
import { buttonClass } from '@/components/ui/styles';
import { useCurrentUser, useLogout } from '@/features/auth/hooks';
import { ROLE_LABELS, type Role, type User } from '@/features/auth/types';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  roles?: Role[];
  icon?: typeof Store;
}

/** Menu điều hướng theo vai trò */
const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Trang chủ' },
  { to: '/mon-an', label: 'Món ăn', icon: UtensilsCrossed },
  { to: '/quan-an', label: 'Quầy ăn', icon: Store },
  { to: '/don-hang', label: 'Đơn hàng', roles: ['STUDENT'], icon: ReceiptText },
  { to: '/quan-ly', label: 'Quản lý quầy', roles: ['VENDOR', 'ADMIN'], icon: LayoutDashboard },
  { to: '/quan-tri', label: 'Quản trị', roles: ['ADMIN'], icon: ShieldCheck },
];

const visibleItems = (user: User | null | undefined) =>
  NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-navy-600 hover:bg-gray-100 hover:text-navy-900',
  );

export function Header() {
  const { data: user, isPending } = useCurrentUser();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const items = visibleItems(user);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Điều hướng chính" className="ml-6 hidden items-center gap-1 lg:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
              {item.icon && <item.icon className="size-4" aria-hidden />}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Giỏ hàng: sinh viên có mini cart xem nhanh; khách bấm vào sẽ được mời đăng nhập; chủ quầy / admin không có */}
          {!isPending && !user && <CartButton />}
          {user?.role === 'STUDENT' && <MiniCart />}
          {isPending ? (
            <div className="h-9 w-24 animate-pulse rounded-xl bg-gray-100" aria-hidden />
          ) : user ? (
            <>
              <NotificationBell />
              <UserMenu user={user} />
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link to="/dang-nhap" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                Đăng nhập
              </Link>
              <Link to="/dang-ky" className={buttonClass({ size: 'sm' })}>
                Đăng ký
              </Link>
            </div>
          )}

          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-navy-700 hover:bg-gray-100 lg:hidden"
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-nav" aria-label="Điều hướng di động" className="border-t border-gray-100 bg-white px-4 py-3 lg:hidden">
          <div className="flex flex-col gap-1">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass} onClick={closeMobile}>
                {item.icon && <item.icon className="size-4" aria-hidden />}
                {item.label}
              </NavLink>
            ))}
            {!user && !isPending && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Link to="/dang-nhap" className={buttonClass({ variant: 'outline' })} onClick={closeMobile}>
                  Đăng nhập
                </Link>
                <Link to="/dang-ky" className={buttonClass()} onClick={closeMobile}>
                  Đăng ký
                </Link>
              </div>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

function NotificationBell() {
  const { data: count = 0 } = useUnreadCount();
  return (
    <Link
      to="/thong-bao"
      className="relative inline-flex size-10 items-center justify-center rounded-xl text-navy-700 hover:bg-gray-100"
      aria-label={count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
    >
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white ring-2 ring-white" aria-hidden>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

/** Khách chưa đăng nhập: giỏ hàng luôn trống, bấm vào trang giỏ sẽ được mời đăng nhập */
function CartButton() {
  return (
    <Link
      to="/gio-hang"
      className="relative inline-flex size-10 items-center justify-center rounded-xl text-navy-700 hover:bg-gray-100"
      aria-label="Giỏ hàng"
    >
      <ShoppingBag className="size-5" aria-hidden />
    </Link>
  );
}

function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const logout = useLogout();

  // Đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout.mutate(undefined, {
      onSuccess: () => toast.success('Đã đăng xuất'),
      onSettled: () => navigate('/'),
    });
  };

  const initials = user.fullName
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const menuItemClass = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-navy-700 hover:bg-gray-100';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${user.fullName}`}
        title={user.fullName}
        className="flex items-center gap-2 rounded-xl py-1 pr-2 pl-1 hover:bg-gray-100"
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-navy-900 text-xs font-bold text-white" aria-hidden>
          {initials}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium sm:block">{user.fullName}</span>
        <ChevronDown className="size-4 text-navy-400" aria-hidden />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl border border-gray-100 bg-white p-2 shadow-(--shadow-card-hover)">
          <div className="border-b border-gray-100 px-3 pt-1 pb-3">
            <p className="truncate font-semibold">{user.fullName}</p>
            <p className="truncate text-xs text-navy-500">{user.email}</p>
            <span className="mt-2 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
          <div className="pt-2">
            <Link role="menuitem" to="/tai-khoan" className={menuItemClass} onClick={() => setOpen(false)}>
              <UserIcon className="size-4" aria-hidden /> Tài khoản của tôi
            </Link>
            {user.role === 'STUDENT' && (
              <Link role="menuitem" to="/don-hang" className={menuItemClass} onClick={() => setOpen(false)}>
                <ReceiptText className="size-4" aria-hidden /> Đơn hàng của tôi
              </Link>
            )}
            {user.role !== 'STUDENT' && (
              <Link
                role="menuitem"
                to={user.role === 'ADMIN' ? '/quan-tri' : '/quan-ly'}
                className={menuItemClass}
                onClick={() => setOpen(false)}
              >
                <LayoutDashboard className="size-4" aria-hidden /> Bảng điều khiển
              </Link>
            )}
            <button role="menuitem" type="button" className={cn(menuItemClass, 'text-red-600 hover:bg-red-50')} onClick={handleLogout}>
              <LogOut className="size-4" aria-hidden /> Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
