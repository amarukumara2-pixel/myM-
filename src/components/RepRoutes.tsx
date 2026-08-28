import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Search, Calendar, UserX, Navigation, TrendingUp, Store, RefreshCw, Compass } from 'lucide-react';
import { fetchTableData } from '../lib/sync';
import { parseLocation } from '../lib/mapHelpers';
import { calculateDistanceKm, getGoogleMapsNavUrl } from '../lib/gpsTracker';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon path issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom numbered marker icon generator
const createNumberedIcon = (number: number, color: string = '#2563EB') => {
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        background-color: ${color};
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 800;
        border: 2px solid white;
        box-shadow: 0 3px 6px rgba(0,0,0,0.3);
      ">
        ${number}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
};

const MapLines = React.memo(({ groupedLocations }: { groupedLocations: Record<string, {lat: number, lng: number}[]> }) => {
  const colors = ['#2563EB', '#D97706', '#059669', '#DC2626', '#7C3AED'];
  return (
    <>
      {Object.entries(groupedLocations).map(([repId, locations], idx) => {
        if (locations.length > 1) {
          return (
            <Polyline 
               key={repId} 
               positions={locations.map(loc => [loc.lat, loc.lng])} 
               color={colors[idx % colors.length]} 
               weight={4}
               opacity={0.8}
               dashArray="6, 6"
            />
          );
        }
        return null;
      })}
    </>
  );
});

// Custom hook to set map center and bounds
function MapUpdater({ mapLocations }: { mapLocations: {lat: number, lng: number}[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (mapLocations.length > 0) {
      if (mapLocations.length === 1) {
        map.setView([mapLocations[0].lat, mapLocations[0].lng], 14);
      } else {
        const bounds = L.latLngBounds(mapLocations.map(loc => [loc.lat, loc.lng]));
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } else {
      map.setView([7.8731, 80.7718], 7);
    }
  }, [mapLocations, map]);
  return null;
}

export default React.memo(function RepRoutes({ lang = 'en' }: { lang?: 'en' | 'si' }) {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchRep, setSearchRep] = useState('');
  const [searchDate, setSearchDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [liveLocations, setLiveLocations] = useState<any[]>([]);

  useEffect(() => {
    loadSales();
    
    // Load live locations directly from Firestore
    let unsubLocs = () => {};
    Promise.all([import('firebase/firestore'), import('../lib/sync')]).then(([{ collection, query, where, onSnapshot }, { db, isQuotaPaused }]) => {
       if (isQuotaPaused()) return;
       const orgId = localStorage.getItem('bizflow_active_org') || 'MYM-BIZFLOW';
       unsubLocs = onSnapshot(query(collection(db, 'rep_locations'), where('organizationId', '==', orgId)), (snap) => {
           const locs: any[] = [];
           snap.forEach(doc => locs.push(doc.data()));
           setLiveLocations(locs);
       }, (err) => {
           console.warn('Rep locations sync notice:', err?.message || err);
       });
    });

    const handleSync = (e: any) => {
      if (e.detail?.table === 'sales') {
        loadSales();
      }
    };
    window.addEventListener('bizflow_sync', handleSync);
    return () => { window.removeEventListener('bizflow_sync', handleSync); unsubLocs(); };
  }, []);

  const loadSales = async () => {
    setLoading(true);
    const data = await fetchTableData('sales');
    if (data) {
      setSales((data as any[]).sort((a: any, b: any) => new Date(a.createdAt || a.date || 0).getTime() - new Date(b.createdAt || b.date || 0).getTime()));
    }
    setLoading(false);
  };

  const filteredSales = useMemo(() => sales.filter(s => {
      if (!s || s.status === 'cancelled') return false;
      const matchRep = !searchRep || 
                       (s.repId || '').toLowerCase().includes(searchRep.toLowerCase()) || 
                       (s.customer || '').toLowerCase().includes(searchRep.toLowerCase());
      
      const sDateStr = s.createdAt ? (typeof s.createdAt === 'string' ? s.createdAt : new Date(s.createdAt).toISOString()) : '';
      const matchDate = sDateStr.startsWith(searchDate);
      return matchRep && matchDate;
  }), [sales, searchRep, searchDate]);

  // Extract unique reps from today's sales
  const uniqueReps = useMemo(() => Array.from(new Set(sales.map(s => s.repId).filter(Boolean))), [sales]);

  // Calculate Map center
  const mapLocations = useMemo(() => filteredSales
      .map(s => parseLocation(s.locationStr))
      .filter(l => l !== null) as {lat: number, lng: number}[], [filteredSales]);
  
  // Group by Rep for polylines
  const groupedLocations = useMemo(() => {
    const gl: Record<string, {lat: number, lng: number}[]> = {};
    filteredSales.forEach(s => {
        const loc = parseLocation(s.locationStr);
        if (loc && s.repId) {
            if (!gl[s.repId]) gl[s.repId] = [];
            gl[s.repId].push({lat: loc.lat, lng: loc.lng});
        }
    });
    return gl;
  }, [filteredSales]);

  // Calculate total route distance covered
  const totalDistanceKm = useMemo(() => {
    let dist = 0;
    Object.values(groupedLocations).forEach(locList => {
      for (let i = 0; i < locList.length - 1; i++) {
        dist += calculateDistanceKm(locList[i].lat, locList[i].lng, locList[i+1].lat, locList[i+1].lng);
      }
    });
    return dist;
  }, [groupedLocations]);

  const totalRouteSales = useMemo(() => filteredSales.reduce((acc, s) => acc + Number(s.total || s.creditReceivedAmount || 0), 0), [filteredSales]);
  const gpsTaggedCount = useMemo(() => filteredSales.filter(s => !!parseLocation(s.locationStr)).length, [filteredSales]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Compass className="text-blue-600" />
          {lang === 'si' ? 'රෙෆ් මාර්ග සහ GPS පිහිටුම් සිතියම' : 'Rep Routes & GPS Shop Locations'}
        </h3>
        <p className="text-slate-500 text-sm mt-1">
          {lang === 'si' 
            ? 'රෙෆ්වරුන් බිල්පත් නිකුත් කළ ස්ථාන සහ ගමන් මාර්ගය සජීවීව නිරීක්ෂණය කරන්න' 
            : 'Track real-time GPS locations of shop visits, journey routes, and turn-by-turn navigation.'}
        </p>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase mb-1">
            <span>{lang === 'si' ? 'පිවිසි කඩ සංඛ්‍යාව' : 'Shops Visited'}</span>
            <Store size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-800">{filteredSales.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{gpsTaggedCount} {lang === 'si' ? 'GPS සටහන් විය' : 'with GPS pins'}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase mb-1">
            <span>{lang === 'si' ? 'මාර්ගයේ මුළු විකුණුම්' : 'Route Total Sales'}</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600">
            Rs. {totalRouteSales.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{filteredSales.length} {lang === 'si' ? 'බිල්පත්' : 'transactions'}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase mb-1">
            <span>{lang === 'si' ? 'මාර්ග දුර' : 'Estimated Distance'}</span>
            <Navigation size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-slate-800">
            {totalDistanceKm.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{lang === 'si' ? 'ගමන් කළ මාර්ගය' : 'between waypoints'}</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase mb-1">
            <span>{lang === 'si' ? 'සක්‍රිය රෙෆ්වරු' : 'Active Reps'}</span>
            <MapPin size={16} className="text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-600">
            {Object.keys(groupedLocations).length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{liveLocations.length} {lang === 'si' ? 'සජීවීව මාර්ගගතව' : 'live connected'}</div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
               type="text" 
               placeholder={lang === 'si' ? 'රෙෆ් හෝ කඩේ නම අනුව සොයන්න...' : 'Search by Rep ID or Customer shop name...'} 
               value={searchRep}
               onChange={e => setSearchRep(e.target.value)}
               className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 text-sm font-medium text-slate-800"
             />
          </div>

          <div className="w-full md:w-48">
            <select
              value={searchRep}
              onChange={e => setSearchRep(e.target.value)}
              className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 ring-blue-500/20"
            >
              <option value="">{lang === 'si' ? 'සියලුම රෙෆ්වරු (All Reps)' : 'All Sales Reps'}</option>
              {uniqueReps.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="relative w-full md:w-48">
             <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
             <input 
               type="date" 
               value={searchDate}
               onChange={e => setSearchDate(e.target.value)}
               className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 ring-blue-500/20 text-sm font-medium text-slate-800"
             />
          </div>

          <button 
            onClick={loadSales} 
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition flex items-center justify-center gap-1.5 shadow-sm"
          >
             <RefreshCw size={15} />
             {lang === 'si' ? 'යාවත්කාලීන කරන්න' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400 text-sm font-medium">Loading route data...</div>
        ) : (
          <>
             {/* Map */}
             <div className="h-[420px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-50 relative z-0">
                <MapContainer 
                    center={[7.8731, 80.7718]} 
                    zoom={7} 
                    style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <MapUpdater mapLocations={mapLocations} />
                  
                  {filteredSales.map((sale, idx) => {
                      const loc = parseLocation(sale.locationStr);
                      if (!loc) return null;
                      
                      return (
                          <Marker 
                              key={sale.id || `marker-${idx}`} 
                              position={[loc.lat, loc.lng]}
                              icon={createNumberedIcon(idx + 1, '#2563EB')}
                          >
                            <Popup>
                                <div className="p-1 min-w-[180px]">
                                   <div className="flex items-center gap-1 text-[11px] font-bold text-blue-600 mb-1">
                                     <span>#{idx + 1} Visit</span> • <span>{new Date(sale.createdAt || sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                   </div>
                                   <h4 className="font-bold text-sm text-slate-800">{sale.customer || 'Customer Shop'}</h4>
                                   {sale.address && <p className="text-xs text-slate-500">{sale.address}</p>}
                                   
                                   <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                                     <span className="text-xs font-semibold text-slate-500">Rep: {sale.repId}</span>
                                     <span className="font-bold text-sm text-emerald-600">Rs. {Number(sale.total || sale.creditReceivedAmount || 0).toLocaleString()}</span>
                                   </div>

                                   <a 
                                     href={getGoogleMapsNavUrl(loc.lat, loc.lng)} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="mt-3 block text-center py-1.5 px-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition"
                                   >
                                     📍 Google Maps Navigation
                                   </a>
                                </div>
                            </Popup>
                          </Marker>
                      );
                  })}
                  
                  <MapLines groupedLocations={groupedLocations} />

                  {/* Live Rep Locations */}
                  {liveLocations.map((loc, idx) => {
                      const parsed = parseLocation(loc.location);
                      if (!parsed) return null;
                      return (
                          <Marker 
                            key={`live-${loc.repId}-${idx}`} 
                            position={[parsed.lat, parsed.lng]}
                            icon={createNumberedIcon(idx + 1, '#10B981')}
                          >
                             <Popup>
                                <div className="p-1 min-w-[150px]">
                                   <h4 className="font-bold text-sm text-emerald-600">🟢 LIVE: {loc.repName || loc.repId}</h4>
                                   <p className="text-xs text-slate-500">Updated: {new Date(loc.timestamp).toLocaleTimeString()}</p>
                                </div>
                             </Popup>
                          </Marker>
                      )
                  })}

                </MapContainer>
             </div>

             {/* Visits Table */}
             <div className="overflow-x-auto">
               <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                   <tr>
                     <th className="py-3 px-3">#</th>
                     <th className="py-3 px-3">{lang === 'si' ? 'වේලාව' : 'Time'}</th>
                     <th className="py-3 px-3">{lang === 'si' ? 'රෙෆ්' : 'Rep'}</th>
                     <th className="py-3 px-3">{lang === 'si' ? 'වෙළඳසැල / ගනුදෙනුකරු' : 'Shop / Customer'}</th>
                     <th className="py-3 px-3">{lang === 'si' ? 'වටිනාකම' : 'Bill Amount'}</th>
                     <th className="py-3 px-3">{lang === 'si' ? 'GPS පිහිටුම' : 'GPS Coordinates'}</th>
                     <th className="py-3 px-3 text-right">{lang === 'si' ? 'නැවිගේෂන්' : 'Navigation'}</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {filteredSales.map((sale, i) => {
                     const loc = parseLocation(sale.locationStr);
                     return (
                       <tr key={sale.id || i} className="hover:bg-slate-50/60 transition-colors">
                         <td className="py-3 px-3 font-bold text-slate-400">{i + 1}</td>
                         <td className="py-3 px-3 text-xs text-slate-600">
                           {sale.createdAt || sale.date ? new Date(sale.createdAt || sale.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                         </td>
                         <td className="py-3 px-3 font-semibold text-slate-700">
                           {sale.repId}
                         </td>
                         <td className="py-3 px-3">
                           <div className="font-bold text-slate-800">{sale.customer || 'Unknown'}</div>
                           {sale.address && <div className="text-xs text-slate-400">{sale.address}</div>}
                         </td>
                         <td className="py-3 px-3 text-sm font-bold text-slate-800">
                           {sale.total ? `Rs. ${Number(sale.total).toLocaleString()}` : (sale.creditReceivedAmount ? `Rs. ${Number(sale.creditReceivedAmount).toLocaleString()}` : '-')}
                         </td>
                         <td className="py-3 px-3 text-xs font-mono text-slate-500">
                           {sale.locationStr ? sale.locationStr : (
                             <span className="text-slate-300 italic">{lang === 'si' ? 'GPS නැත' : 'No GPS'}</span>
                           )}
                         </td>
                         <td className="py-3 px-3 text-right">
                            {loc ? (
                               <a 
                                  href={getGoogleMapsNavUrl(loc.lat, loc.lng)} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                               >
                                  <MapPin size={13} className="mr-1" /> Open Maps
                                </a>
                            ) : '-'}
                         </td>
                       </tr>
                     );
                   })}
                   {filteredSales.length === 0 && (
                     <tr>
                       <td colSpan={7} className="py-10 text-center text-slate-400 text-sm">
                         <UserX className="mx-auto w-8 h-8 opacity-20 mb-2" />
                         {lang === 'si' ? 'තෝරාගත් දිනයේ මාර්ග දත්ත නොමැත' : 'No route or shop visit data found for this date & rep'}
                       </td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
          </>
        )}
      </div>
    </div>
  );
});
