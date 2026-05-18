/**
 * Waze Proxy Logic for UI Integration
 */
export const searchPlaces = async (query: string) => {
  // Direct fetch to Waze in browser often triggers CORS. 
  // In a real app, this is handled by the Flutter Native side or a backend proxy.
  // For the UI preview, we will attempt the fetch or fallback to Nominatim if blocked.
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=my`;
    const res = await fetch(url);
    return await res.json();
  } catch (e) {
    return [];
  }
};

export const getRoute = async (start: [number, number], end: [number, number], vehicle: string) => {
  // Use OSRM as reliable backup for the web UI logic
  let profile = 'driving';
  if (vehicle === 'motor') profile = 'driving'; // OSRM doesn't have a public motorbike profile usually
  if (vehicle === 'train') profile = 'driving'; // In preview, follow roads as a fallback

  const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  return data;
};
