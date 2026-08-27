import React, { useState } from 'react';
import { Search, MapPin, Calendar, Package, Trash2, Edit } from 'lucide-react';

export const CustomerHistoryTab = ({ salesHistory, lang, onDeleteSale, onEditSale }: { salesHistory: any[], lang: 'en' | 'si', onDeleteSale?: (sale: any) => void, onEditSale?: (sale: any) => void }) => {
  const [search, setSearch] = useState('');

  const filteredSales = salesHistory
    .filter(sale => (sale.customer || '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());

  return (
    <div className="p-6 bg-white rounded-[2rem] shadow-sm border border-slate-100">
      <h2 className="text-2xl font-black text-slate-800 mb-6 font-display">
        {lang === 'si' ? 'පාරිභෝගික බිල්පත් ඉතිහාසය' : 'Customer Bill History'}
      </h2>
      
      <div className="relative mb-6">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder={lang === 'si' ? 'පාරිභෝගික නම සොයන්න...' : 'Search customer name...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:border-blue-500 font-medium text-slate-800"
        />
      </div>

      <div className="space-y-4">
        {filteredSales.map((sale, index) => (
          <div key={sale.id || index} className="p-4 border border-slate-100 rounded-2xl bg-white shadow-sm hover:border-blue-100 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-black text-slate-800 flex items-center gap-2">
                  <span>{sale.customer}</span>
                  {sale.status === 'cancelled' && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                      ❌ {lang === 'si' ? 'අවලංගුයි' : 'Cancelled'}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 font-bold flex items-center gap-1 mt-1">
                  <MapPin size={12} /> {sale.locationStr || 'N/A'}
                </p>
                {sale.status === 'cancelled' && (
                  <div className="mt-2 p-2 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-800">
                    <span className="font-bold">⚠️ {lang === 'si' ? 'අවලංගු කිරීමට හේතුව' : 'Cancellation Reason'}:</span>{' '}
                    <span className="font-medium text-slate-800">{sale.cancelReason || 'නැත'}</span>
                    {sale.cancelledBy && (
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        {lang === 'si' ? 'අවලංගු කළේ' : 'Cancelled by'}: {sale.cancelledBy} {sale.cancelledAt ? `(${new Date(sale.cancelledAt).toLocaleString()})` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {onEditSale && sale.status !== 'cancelled' && (
                  <button
                    onClick={() => onEditSale(sale)}
                    className="p-2 text-amber-600 hover:bg-amber-50 rounded-xl transition-colors border border-amber-100 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title={lang === 'si' ? 'බිල සංස්කරණය කරන්න' : 'Edit Bill'}
                  >
                    <Edit size={15} />
                    <span>{lang === 'si' ? 'සංස්කරණය' : 'Edit'}</span>
                  </button>
                )}
                {onDeleteSale && (
                  <button
                    onClick={() => onDeleteSale(sale)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors border border-rose-100 flex items-center gap-1 text-xs font-bold cursor-pointer"
                    title={lang === 'si' ? 'බිල මකා දමන්න' : 'Delete Bill'}
                  >
                    <Trash2 size={15} />
                    <span>{lang === 'si' ? 'මකන්න' : 'Delete'}</span>
                  </button>
                )}
                <div className="text-right">
                  <p className="text-lg font-black text-emerald-600">Rs. {(sale.total || sale.creditReceivedAmount || 0).toLocaleString()}</p>
                  <p className="text-xs text-slate-400 font-bold flex items-center justify-end gap-1">
                    <Calendar size={12} /> {new Date(sale.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Package size={12} /> {lang === 'si' ? 'භාණ්ඩ' : 'Items'}
              </p>
              <div className="space-y-1">
                {(sale.items || []).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs font-medium text-slate-700">
                    <span>{item.name} x {item.qty}</span>
                    <span>Rs. {(item.price * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {filteredSales.length === 0 && (
          <p className="text-center text-slate-400 font-medium py-10">
            {lang === 'si' ? 'කිසිදු දත්තයක් හමු නොවීය.' : 'No data found.'}
          </p>
        )}
      </div>
    </div>
  );
};
