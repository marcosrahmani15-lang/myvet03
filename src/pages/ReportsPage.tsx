import React from 'react';
import { BarChart3 } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { formatMoneyDzd } from '../i18n';

const SPECIES_COLORS = [
  'bg-[#254222]',
  'bg-[#99CC66]',
  'bg-[#4A6644]',
];
const ACT_COLORS = [
  'bg-[#99CC66]',
  'bg-[#254222]',
  'bg-[#4A6644]',
  'bg-[#DC2626]',
];

export const ReportsPage: React.FC = () => {
  const { reportsOverview, loading } = useClinicData();
  const { language, t, td } = useLanguage();

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-[#5E7F52]" />
          <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
            {t.reports.title}
          </h1>
        </div>
        <p className="text-[14px] text-[#4A6644] mt-0.5">
          {t.reports.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title={t.reports.kpiConsultsMonth}
          value={loading && !reportsOverview ? '—' : reportsOverview?.consultationsCount ?? 0}
        />
        <StatCard
          title={t.reports.kpiActivePatients}
          value={loading && !reportsOverview ? '—' : `+${reportsOverview?.newPatientsCount ?? 0}`}
          valueColor="text-[#5E7F52]"
        />
        <StatCard
          title={t.reports.kpiVaccineRate}
          value={
            loading && !reportsOverview
              ? '—'
              : `${(reportsOverview?.vaccinationCompletionRate ?? 0).toFixed(1)} %`
          }
        />
        <StatCard
          title={t.reports.kpiMonthlyRevenue}
          value={
            loading && !reportsOverview
              ? '—'
              : formatMoneyDzd(Math.round(reportsOverview?.monthlyRevenueDzd ?? 0), language)
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-4">
          <h3 className="text-[16px] font-bold text-[#254222]">
            {t.reports.speciesBreakdownTitle}
          </h3>
          <div className="space-y-3">
            {(reportsOverview?.speciesBreakdown || []).map((item, idx) => (
              <div key={item.label}>
                <div className="flex justify-between text-[13px] font-semibold text-[#254222] mb-1">
                  <span>
                    {td('species', item.label)} ({item.count})
                  </span>
                  <span className="tabular-nums">{item.percentage}%</span>
                </div>
                <div className="w-full h-3 bg-[#CAE4C5]/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${SPECIES_COLORS[idx % SPECIES_COLORS.length]} rounded-full transition-all`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {(!reportsOverview || reportsOverview.speciesBreakdown.length === 0) && (
              <p className="text-[13px] text-[#5E7F52]">{t.reports.noPatientData}</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-4">
          <h3 className="text-[16px] font-bold text-[#254222]">
            {t.reports.actTypesTitle}
          </h3>
          <div className="space-y-3">
            {(reportsOverview?.actTypeBreakdown || []).map((item, idx) => (
              <div key={item.label}>
                <div className="flex justify-between text-[13px] font-semibold text-[#254222] mb-1">
                  <span>
                    {td('appointmentType', item.label)} ({item.count})
                  </span>
                  <span>{item.percentage}%</span>
                </div>
                <div className="w-full h-3 bg-[#CAE4C5]/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${ACT_COLORS[idx % ACT_COLORS.length]} rounded-full transition-all`}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
            {(!reportsOverview || reportsOverview.actTypeBreakdown.length === 0) && (
              <p className="text-[13px] text-[#5E7F52]">{t.reports.noActsRecorded}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
