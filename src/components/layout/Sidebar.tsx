import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Stethoscope,
  CalendarDays,
  Users,
  MessageSquareText,
  Receipt,
  CreditCard,
  BedDouble,
  ListTodo,
  Package,
  BarChart3,
  Settings,
  Globe,
  Menu,
  X,
  MapPin
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { AppLanguage, LANGUAGE_OPTIONS, TranslationDictionary } from '../../i18n';
import { MyVetLogo } from '../common/MyVetLogo';

interface NavConfigItem {
  id: keyof TranslationDictionary['nav'];
  path: string;
  icon: React.ElementType;
}

const NAV_CONFIG: NavConfigItem[] = [
  { id: 'dashboard', path: '/', icon: LayoutDashboard },
  { id: 'patients', path: '/patients', icon: Stethoscope },
  { id: 'agenda', path: '/agenda', icon: CalendarDays },
  { id: 'clients', path: '/clients', icon: Users },
  { id: 'sms', path: '/sms', icon: MessageSquareText },
  { id: 'invoicing', path: '/facturation', icon: Receipt },
  { id: 'cash', path: '/cloture-caisse', icon: CreditCard },
  { id: 'hospitalization', path: '/hospitalisation', icon: BedDouble },
  { id: 'tasks', path: '/taches', icon: ListTodo },
  { id: 'inventory', path: '/stocks', icon: Package },
  { id: 'reports', path: '/rapports', icon: BarChart3 },
  { id: 'settings', path: '/parametres', icon: Settings },
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (itemPath: string) => {
    if (itemPath === '/') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    if (itemPath === '/patients' && location.pathname.startsWith('/patients')) return true;
    return location.pathname === itemPath;
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    setMobileOpen(false);
  };

  const userFullName = session.user?.fullName || 'Dr. Vétérinaire';
  const userInitials = session.user?.avatarInitials || 'DV';
  const roleKey = (session.activeRole || 'veterinarian') as keyof TranslationDictionary['roles'];
  const roleLabel = t.roles[roleKey] || session.activeRole || t.roles.veterinarian;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FFFFFF] border-e border-[#CAE4C5] select-none">
      {/* Brand Header */}
      <div
        onClick={() => handleNavClick('/')}
        className="px-4 py-4 border-b border-[#CAE4C5]/70 cursor-pointer hover:bg-[#F7FAF4] transition-colors"
      >
        <MyVetLogo variant="header" showSlogan={false} />
      </div>

      {/* Single Clinic Location Badge (Ouled Fayet only) */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#ECE2B1]/65 border border-[#ECE2B1] text-[11.5px]">
          <MapPin className="w-3.5 h-3.5 text-[#254222] shrink-0" />
          <span className="font-bold text-[#254222] truncate">
            {t.meta.appName} — {t.meta.clinicCity}
          </span>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {NAV_CONFIG.map((item) => {
          const active = isActive(item.path);
          const IconComponent = item.icon;
          const copy = t.nav[item.id];
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.path)}
              className={`w-full text-start flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-[#CAE4C5] border border-[#99CC66] border-s-4 border-s-[#99CC66] shadow-2xs'
                  : 'hover:bg-[#F7FAF4] border border-transparent'
              }`}
            >
              <div
                className={`mt-0.5 shrink-0 transition-colors ${
                  active ? 'text-[#254222]' : 'text-[#5E7F52]'
                }`}
              >
                <IconComponent className="w-[18px] h-[18px]" />
              </div>
              <div className="flex flex-col min-w-0 pe-1">
                <span
                  className={`text-[13.5px] leading-snug truncate ${
                    active ? 'text-[#254222] font-bold' : 'text-[#254222] font-semibold'
                  }`}
                >
                  {copy.title}
                </span>
                <span
                  className={`text-[11px] leading-tight truncate ${
                    active ? 'text-[#254222]/85 font-semibold' : 'text-[#4A6644]'
                  }`}
                >
                  {copy.subtitle}
                </span>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Fixed Bottom Section */}
      <div className="p-4 border-t border-[#CAE4C5] space-y-3 shrink-0 bg-[#FFFFFF]">
        {/* Language selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 border border-[#CAE4C5] rounded-lg bg-[#F7FAF4] text-[13px] text-[#254222] font-medium shadow-2xs flex-1 min-w-0">
            <Globe className="w-4 h-4 text-[#5E7F52] shrink-0" />
            <select
              aria-label={t.sidebar.selectLanguageAria}
              value={language}
              onChange={(e) => setLanguage(e.target.value as AppLanguage)}
              className="flex-1 min-w-0 bg-transparent text-[13px] font-semibold text-[#254222] focus:outline-none cursor-pointer"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.nativeLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active Practitioner Profile */}
        <div className="flex items-center gap-2.5 px-1 py-1 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#CAE4C5] text-[#254222] border border-[#99CC66] font-bold text-xs flex items-center justify-center shrink-0">
            {userInitials}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-[13px] text-[#254222] truncate">
              {userFullName}
            </span>
            <span className="text-[11px] text-[#4A6644] truncate">
              {roleLabel} · {t.meta.clinicCity}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white/95 backdrop-blur-md border-b border-[#CAE4C5] flex items-center px-3 z-30 justify-between shadow-2xs">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg border border-[#CAE4C5] shadow-2xs text-[#254222] bg-[#F7FAF4] hover:bg-[#CAE4C5] transition-colors cursor-pointer"
          aria-label={t.sidebar.toggleNavAria}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <span className="font-bold text-sm text-[#254222] tracking-wide flex items-center gap-1.5">
          <span className="text-[#99CC66]">🐾</span> {t.meta.appName}
        </span>
        <div className="w-9" aria-hidden="true" />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40 backdrop-blur-xs"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer (adapts start edge & slide direction for LTR/RTL) */}
      <aside
        className={`lg:hidden fixed inset-y-0 start-0 z-50 w-[275px] transform transition-transform duration-200 ease-in-out shadow-xl ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-[272px] shrink-0 h-screen sticky top-0 border-e border-[#CAE4C5] bg-white z-20">
        {sidebarContent}
      </aside>
    </>
  );
};
