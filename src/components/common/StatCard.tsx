import React from 'react';

interface StatCardProps {
  title: string;
  value: number | string;
  valueColor?: string; // e.g. 'text-[#254222]' or 'text-[#DC2626]'
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  valueColor = 'text-[#254222]',
  className = ''
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-[#CAE4C5] p-5 shadow-2xs flex flex-col justify-between min-h-[106px] transition-all duration-150 ${className}`}
    >
      <span className="text-[13.5px] font-medium text-[#4A6644]">
        {title}
      </span>
      <span className={`text-[32px] font-bold leading-none tracking-tight tabular-nums ${valueColor}`}>
        {value}
      </span>
    </div>
  );
};
