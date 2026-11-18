import React from 'react';
import { useLanguage } from '../../context/LanguageContext';

interface MyVetLogoProps {
  variant?: 'full' | 'compact' | 'header' | 'icon';
  className?: string;
  showSlogan?: boolean;
}

export const MyVetLogo: React.FC<MyVetLogoProps> = ({
  variant = 'compact',
  className = '',
  showSlogan = false
}) => {
  const { t } = useLanguage();

  // Botanical Heart SVG Emblem with Dog, Cat silhouettes, Olive leaves, and Medical Cross
  const HeartEmblem = ({ size = 44 }: { size?: number }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      {/* Outer Heart outline */}
      <path
        d="M50 88C50 88 15 65 15 38C15 23 26 14 38 14C45 14 50 18 50 22C50 18 55 14 62 14C74 14 85 23 85 38C85 65 50 88 50 88Z"
        stroke="#254222"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#CAE4C5"
      />

      {/* Medical Cross on upper right corner */}
      <rect x="74" y="10" width="7" height="20" rx="2" fill="#99CC66" />
      <rect x="67.5" y="16.5" width="20" height="7" rx="2" fill="#99CC66" />

      {/* Dog silhouette (deep forest green) */}
      <path
        d="M32 68C32 64 35 55 35 48C35 44 32 40 34 33C35 29 38 27 41 28C43 29 45 32 46 35C48 35 52 34 54 37C55 38 53 41 51 43C53 47 55 53 54 60C53 65 50 72 48 76C44 76 34 75 32 68Z"
        fill="#254222"
      />

      {/* Cat silhouette (fresh leaf green) */}
      <path
        d="M48 76C48 71 50 63 53 58C55 54 58 52 60 48C61 46 63 46 64 47C65 49 63 51 64 53C66 53 68 56 67 59C66 63 65 67 66 73C65 76 60 77 56 77C52 77 49 77 48 76Z"
        fill="#99CC66"
      />

      {/* Cat ear accents */}
      <polygon points="56,47 58,41 61,46" fill="#99CC66" />
      <polygon points="62,46 64,42 66,48" fill="#99CC66" />

      {/* Botanical Olive Branch leaves under heart */}
      <path
        d="M20 70C25 76 33 80 44 82"
        stroke="#254222"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx="25" cy="71" rx="4" ry="2" transform="rotate(-30 25 71)" fill="#99CC66" />
      <ellipse cx="32" cy="76" rx="4" ry="2" transform="rotate(-15 32 76)" fill="#99CC66" />
      <ellipse cx="40" cy="80" rx="4" ry="2" transform="rotate(5 40 80)" fill="#99CC66" />
    </svg>
  );

  // Paw Print SVG
  const Paw = ({ size = 14, color = '#99CC66' }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className="inline-block shrink-0">
      <ellipse cx="8.5" cy="5.5" rx="2.5" ry="3.5" transform="rotate(-15 8.5 5.5)" />
      <ellipse cx="15.5" cy="5.5" rx="2.5" ry="3.5" transform="rotate(15 15.5 5.5)" />
      <ellipse cx="4" cy="11" rx="2.5" ry="3.5" transform="rotate(-30 4 11)" />
      <ellipse cx="20" cy="11" rx="2.5" ry="3.5" transform="rotate(30 20 11)" />
      <path d="M12 10.5C8 10.5 6 13.5 7 17.5C7.8 20.5 10 21.5 12 21.5C14 21.5 16.2 20.5 17 17.5C18 13.5 16 10.5 12 10.5Z" />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <HeartEmblem size={38} />
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <div className="flex items-center gap-4">
          <HeartEmblem size={64} />
          <div className="flex flex-col items-start text-start">
            <div className="flex items-baseline gap-2">
              <span className="font-brand-script text-[42px] leading-none text-[#254222] tracking-wide select-none">
                {t.meta.appName}
              </span>
              <Paw size={22} color="#99CC66" />
            </div>
            <span className="text-[13px] font-extrabold tracking-[0.22em] text-[#254222] uppercase mt-0.5">
              {t.meta.cabinetLabel}
            </span>
          </div>
        </div>

        {showSlogan && (
          <div className="flex items-center gap-2 mt-2 text-[12px] text-[#4A6644] font-medium tracking-wide">
            <Paw size={11} color="#99CC66" />
            <span>{t.meta.slogan}</span>
            <Paw size={11} color="#99CC66" />
          </div>
        )}
      </div>
    );
  }

  // Header / compact default
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="w-11 h-11 rounded-xl bg-[#CAE4C5] flex items-center justify-center shrink-0 border border-[#99CC66] shadow-2xs p-1">
        <img
          src="/assets/aistudio/894305336_2247546189166984_8672162545694501918_n-removebg-preview_a9b96d23.png"
          alt="My Vet Logo"
          className="w-full h-full object-contain"
        />
      </div>
      <div className="flex flex-col min-w-0 text-start">
        <div className="flex items-center gap-1.5 leading-none">
          <span className="font-brand-script text-[24px] font-bold text-[#254222] tracking-tight">
            {t.meta.appName}
          </span>
          <Paw size={14} color="#99CC66" />
        </div>
        <span className="text-[10px] font-extrabold tracking-[0.16em] text-[#3B5B35] uppercase leading-tight mt-0.5">
          {t.meta.cabinetLabel}
        </span>
        {showSlogan && (
          <span className="text-[9.5px] text-[#4A6644] italic truncate mt-0.5">
            {t.meta.slogan}
          </span>
        )}
      </div>
    </div>
  );
};
