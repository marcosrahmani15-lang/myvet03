import React, { useState, useEffect, useCallback } from 'react';
import { Package, AlertTriangle, Plus, Search, History } from 'lucide-react';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { useClinicData } from '../context/DataContext';
import { useLanguage } from '../context/LanguageContext';
import { formatMoneyDzd } from '../i18n';
import { api, ApiError } from '../services/apiClient';
import type { InventoryMovement, StockItem } from '../types';

export const InventoryPage: React.FC = () => {
  const { stocks, createStock, adjustStock } = useClinicData();
  const { t, td, language } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [showMovements, setShowMovements] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newItem, setNewItem] = useState({
    name: '',
    category: 'Vaccin' as StockItem['category'],
    supplier: 'BioVet Distribution',
    quantity: 10,
    minThreshold: 5,
    unit: 'boîtes',
    unitPriceDzd: 1500,
  });

  const loadMovements = useCallback(async () => {
    try {
      const list = await api.get<InventoryMovement[]>('/api/inventory/movements');
      setMovements(list);
    } catch {
      // Non-blocking audit trail load
    }
  }, []);

  useEffect(() => {
    loadMovements();
  }, [loadMovements, stocks.length]);

  const filtered = stocks.filter(
    (i) =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.supplier.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = stocks.filter((i) => i.quantity <= i.minThreshold);
  const criticalCount = lowStockItems.length;
  const activeSuppliersCount = new Set(stocks.map((s) => s.supplier).filter(Boolean)).size;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await createStock({
        name: newItem.name,
        category: newItem.category,
        supplier: newItem.supplier,
        quantity: Number(newItem.quantity),
        minThreshold: Number(newItem.minThreshold),
        unit: newItem.unit,
        unitPriceDzd: Number(newItem.unitPriceDzd) || 0,
      });
      setIsModalOpen(false);
      setNewItem({
        name: '',
        category: 'Vaccin',
        supplier: 'BioVet Distribution',
        quantity: 10,
        minThreshold: 5,
        unit: 'boîtes',
        unitPriceDzd: 1500,
      });
      await loadMovements();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.inventory.createError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustQuantity = async (id: string, delta: number) => {
    setErrorMsg(null);
    try {
      await adjustStock(id, delta, delta > 0 ? t.inventory.quickRestockReason : t.inventory.quickOutReason);
      await loadMovements();
    } catch (err: any) {
      setErrorMsg(err instanceof ApiError ? err.message : t.inventory.adjustError);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1580px] w-full mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <Package className="w-7 h-7 text-[#254222]" />
            <h1 className="text-[26px] font-bold text-[#254222] tracking-tight">
              {t.inventory.title}
            </h1>
          </div>
          <p className="text-[14px] text-[#4A6644] mt-0.5">
            {t.inventory.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowMovements(!showMovements)}
            className="bg-white border border-[#CAE4C5] hover:bg-[#F7FAF4] text-[#254222] px-4 py-2.5 rounded-xl font-semibold text-[13px] transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <History className="w-4 h-4 text-[#254222]" />
            <span>{showMovements ? t.inventory.hideMovementsBtn : `${t.inventory.movementsBtnPrefix} (${movements.length})`}</span>
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-[#254222] hover:bg-[#1B3219] text-white px-5 py-2.5 rounded-xl font-semibold text-[13.5px] transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t.inventory.newItemBtn}</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-[#FEF2F2] border border-[#FECDD3] rounded-xl text-[13px] text-[#991B1B] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <StatCard title={t.inventory.kpiTotalRefs} value={stocks.length} />
        <StatCard
          title={t.inventory.kpiCriticalAlerts}
          value={criticalCount}
          valueColor={criticalCount > 0 ? 'text-[#DC2626]' : 'text-[#254222]'}
        />
        <StatCard title={t.inventory.kpiActiveSuppliers} value={activeSuppliersCount} />
      </div>

      {criticalCount > 0 && (
        <div className="bg-[#FEF2F2] border border-[#FECDD3] rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[#DC2626] shrink-0" />
          <div className="flex-1 text-[13px] text-[#991B1B]">
            <strong>{t.inventory.restockAlertPrefix}</strong>{' '}
            {lowStockItems.map((i) => `${i.name} (${i.quantity} ${i.unit} ${t.inventory.remainingWord})`).join(' · ')}.
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#CAE4C5] p-4 flex items-center gap-4 shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#5E7F52] absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t.inventory.searchPlaceholder}
            className="w-full ps-10 pe-4 py-2 bg-[#F7FAF4] border border-[#CAE4C5] rounded-xl text-[14px] focus:outline-none focus:border-[#254222] focus:bg-white text-[#254222]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#CAE4C5] shadow-2xs overflow-x-auto">
        <table className="w-full text-start text-[13.5px]">
          <thead className="bg-[#F7FAF4] border-b border-[#CAE4C5] text-[12px] font-bold text-[#4A6644] uppercase">
            <tr>
              <th className="py-3 px-5">{t.inventory.colItem}</th>
              <th className="py-3 px-5">{t.inventory.colCategory}</th>
              <th className="py-3 px-5">{t.inventory.colSupplier}</th>
              <th className="py-3 px-5">{t.inventory.colUnitPrice}</th>
              <th className="py-3 px-5">{t.inventory.colStock}</th>
              <th className="py-3 px-5">{t.inventory.colStatus}</th>
              <th className="py-3 px-5 text-end">{t.inventory.colAdjust}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#CAE4C5]">
            {filtered.map((item) => (
              <tr key={item.id} className="hover:bg-[#F7FAF4] transition-colors">
                <td className="py-4 px-5 font-bold text-[#254222]">{item.name}</td>
                <td className="py-4 px-5 text-[#4A6644]">{td('inventoryCategory', item.category)}</td>
                <td className="py-4 px-5 text-[#4A6644]">{item.supplier}</td>
                <td className="py-4 px-5 font-semibold text-[#254222]">
                  {formatMoneyDzd(item.unitPriceDzd || 0, language)}
                </td>
                <td className="py-4 px-5">
                  <span
                    className={`font-bold text-[14px] ${
                      item.quantity <= item.minThreshold ? 'text-[#DC2626]' : 'text-[#254222]'
                    }`}
                  >
                    {item.quantity} {item.unit}
                  </span>
                  <span className="text-[11.5px] text-[#5E7F52] block">
                    {t.inventory.minPrefix} {item.minThreshold}
                  </span>
                </td>
                <td className="py-4 px-5">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-bold ${
                      item.quantity <= item.minThreshold
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#CAE4C5] text-[#254222]'
                    }`}
                  >
                    {item.quantity <= item.minThreshold ? t.inventory.statusCritical : t.inventory.statusOk}
                  </span>
                </td>
                <td className="py-4 px-5 text-end space-x-1 whitespace-nowrap">
                  <button
                    onClick={() => handleAdjustQuantity(item.id, -1)}
                    disabled={item.quantity <= 0}
                    className="w-7 h-7 bg-white border border-[#CAE4C5] rounded-lg text-sm font-bold text-[#4A6644] hover:text-[#254222] hover:bg-[#CAE4C5] disabled:opacity-40 cursor-pointer"
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleAdjustQuantity(item.id, 1)}
                    className="w-7 h-7 bg-white border border-[#CAE4C5] rounded-lg text-sm font-bold text-[#4A6644] hover:text-[#254222] hover:bg-[#CAE4C5] cursor-pointer"
                  >
                    +
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showMovements && (
        <div className="bg-white rounded-2xl border border-[#CAE4C5] p-6 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 border-b border-[#CAE4C5]/70 pb-3">
            <History className="w-5 h-5 text-[#254222]" />
            <h3 className="text-[16px] font-bold text-[#254222]">{t.inventory.movementsTitle}</h3>
          </div>
          {movements.length === 0 ? (
            <p className="text-[13px] text-[#5E7F52]">{t.inventory.noMovements}</p>
          ) : (
            <div className="divide-y divide-[#CAE4C5]">
              {movements.slice(0, 20).map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between text-[13px]">
                  <div>
                    <span className="font-bold text-[#254222]">{m.itemName || m.itemId}</span>
                    <span className="text-[#4A6644] ms-2">({m.reason})</span>
                  </div>
                  <div className="flex items-center gap-3 text-[12px]">
                    <span dir="ltr" className={m.delta >= 0 ? 'font-bold text-[#3B5B35]' : 'font-bold text-[#DC2626]'}>
                      {m.delta >= 0 ? `+${m.delta}` : m.delta}
                    </span>
                    <span dir="ltr" className="text-[#4A6644]">
                      {m.quantityBefore} → {m.quantityAfter}
                    </span>
                    <span className="text-[#5E7F52]">{m.performedBy}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={t.inventory.modalNewTitle}>
        <form onSubmit={handleAddItem} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.nameLabel}</label>
            <input
              type="text"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.categoryLabel}</label>
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value as StockItem['category'] })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none bg-white"
              >
                <option value="Vaccin">{td('inventoryCategory', 'Vaccin')}</option>
                <option value="Antibiotique">{td('inventoryCategory', 'Antibiotique')}</option>
                <option value="Anti-inflammatoire">{td('inventoryCategory', 'Anti-inflammatoire')}</option>
                <option value="Matériel">{td('inventoryCategory', 'Matériel')}</option>
                <option value="Alimentation">{td('inventoryCategory', 'Alimentation')}</option>
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.supplierLabel}</label>
              <input
                type="text"
                value={newItem.supplier}
                onChange={(e) => setNewItem({ ...newItem, supplier: e.target.value })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.qtyLabel}</label>
              <input
                type="number"
                min="0"
                value={newItem.quantity}
                onChange={(e) => setNewItem({ ...newItem, quantity: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.minThresholdLabel}</label>
              <input
                type="number"
                min="0"
                value={newItem.minThreshold}
                onChange={(e) => setNewItem({ ...newItem, minThreshold: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.unitLabel}</label>
              <input
                type="text"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-[#254222] mb-1">{t.inventory.priceDzdLabel}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={newItem.unitPriceDzd}
                onChange={(e) => setNewItem({ ...newItem, unitPriceDzd: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-[#CAE4C5] rounded-xl focus:border-[#254222] focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#CAE4C5]/70">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-[#CAE4C5] rounded-xl text-[13px] text-[#4A6644] hover:bg-[#F7FAF4] cursor-pointer">
              {t.common.cancel}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#254222] text-white rounded-xl text-[13px] font-semibold hover:bg-[#1B3219] disabled:opacity-50 cursor-pointer">
              {submitting ? t.common.saving : t.common.save}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
