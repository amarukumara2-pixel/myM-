const fs = require('fs');
let code = fs.readFileSync('src/components/RepRoutes.tsx', 'utf8');

code = code.replace(/<MapLines groupedLocations={groupedLocations} \/>/g, `<MapLines groupedLocations={groupedLocations} />

                  {/* Live Rep Locations */}
                  {liveLocations.map((loc, idx) => {
                      const parsed = parseLocation(loc.location);
                      if (!parsed) return null;
                      return (
                          <Marker key={\`live-\${loc.repId}-\${idx}\`} position={[parsed.lat, parsed.lng]}>
                             <Popup>
                                <div className="p-1 min-w-[150px]">
                                   <h4 className="font-bold text-sm text-blue-600">LIVE: {loc.repName || loc.repId}</h4>
                                   <p className="text-xs text-slate-500 mb-2">Updated: {new Date(loc.timestamp).toLocaleTimeString()}</p>
                                </div>
                             </Popup>
                          </Marker>
                      )
                  })}
`);

fs.writeFileSync('src/components/RepRoutes.tsx', code);
