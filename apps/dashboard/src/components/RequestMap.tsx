import type { Summary } from "../types";

const LAND: [number, number][][] = [
  [[-168, 71], [-153, 71], [-140, 70], [-128, 71], [-105, 74], [-88, 74], [-70, 68], [-62, 58], [-56, 48], [-68, 44], [-80, 25], [-90, 29], [-97, 26], [-105, 22], [-112, 24], [-117, 32], [-124, 40], [-125, 49], [-136, 56], [-153, 59], [-166, 64]],
  [[-90, 15], [-83, 9], [-77, 8], [-80, 8], [-87, 13], [-92, 16]],
  [[-80, 12], [-77, 8], [-71, 12], [-67, 10], [-60, 8], [-50, 0], [-35, -5], [-35, -10], [-40, -22], [-48, -28], [-62, -40], [-68, -55], [-74, -52], [-71, -42], [-70, -18], [-78, -5], [-80, 8]],
  [[-10, 36], [-9, 42], [-2, 43], [0, 51], [-5, 58], [-8, 54], [-10, 52], [-5, 48], [2, 51], [8, 54], [10, 58], [12, 56], [8, 44], [3, 43], [-5, 36]],
  [[-17, 15], [-16, 28], [10, 37], [11, 32], [25, 32], [32, 31], [43, 12], [51, 12], [43, -1], [40, -15], [35, -25], [28, -33], [18, -34], [14, -18], [9, 4], [8, 13], [-5, 5], [-17, 14]],
  [[28, 41], [36, 36], [44, 37], [48, 42], [60, 45], [68, 45], [78, 43], [87, 28], [92, 22], [98, 8], [103, 1], [104, -6], [115, -8], [120, -8], [128, -3], [141, -10], [147, -18], [153, -26], [146, -38], [138, -35], [128, -32], [115, -34], [114, -22], [104, -5], [98, 8], [80, 6], [72, 8], [68, 24], [60, 25], [57, 26], [51, 25], [44, 12], [43, 12], [36, 22], [32, 31]],
  [[104, 1], [109, 14], [100, 20], [98, 8]],
  [[131, 31], [135, 35], [140, 42], [145, 44], [145, 43], [141, 35], [132, 31]],
  [[113, -22], [122, -18], [130, -12], [136, -14], [142, -11], [146, -18], [153, -26], [146, -38], [130, -32], [115, -34], [114, -22]],
];

const xOf = (lon: number) => lon + 180;
const yOf = (lat: number) => 90 - lat;

export function RequestMap({ places, total }: { places: Summary["places"]; total: number }) {
  const located = places.reduce((sum, place) => sum + place.count, 0);
  const max = Math.max(...places.map((place) => place.count), 1);
  const byCountry = new Map<string, { country: string; count: number; cities: Set<string> }>();
  for (const place of places) {
    const current = byCountry.get(place.country) ?? { country: place.country, count: 0, cities: new Set<string>() };
    current.count += place.count;
    if (place.city) current.cities.add(place.city);
    byCountry.set(place.country, current);
  }
  const rows = [...byCountry.values()].sort((a, b) => b.count - a.count);

  return (
    <section className="obs-map">
      <h2>Where requests come from</h2>
      <p className="obs-lead">
        {located
          ? `${located.toLocaleString()} of ${total.toLocaleString()} requests in this range have a rough location. Hover a dot for the city.`
          : "No located requests in this range yet."}
      </p>
      <svg viewBox="0 0 360 180" role="img" aria-label="Request locations">
        {Array.from({ length: 11 }, (_, index) => -150 + index * 30).map((lon) => (
          <line key={`lon-${lon}`} x1={xOf(lon)} y1={0} x2={xOf(lon)} y2={180} />
        ))}
        {Array.from({ length: 5 }, (_, index) => -60 + index * 30).map((lat) => (
          <line key={`lat-${lat}`} x1={0} y1={yOf(lat)} x2={360} y2={yOf(lat)} />
        ))}
        {LAND.map((ring, index) => (
          <path
            key={index}
            className="obs-map-land"
            d={`${ring.map(([lon, lat], point) => `${point ? "L" : "M"}${xOf(lon).toFixed(1)},${yOf(lat).toFixed(1)}`).join(" ")} Z`}
          />
        ))}
        {places.map((place) => {
          const radius = 1.5 + (Math.sqrt(place.count) / Math.sqrt(max)) * 3.2;
          return (
            <circle
              key={`${place.city}-${place.lat}`}
              className="obs-map-dot"
              cx={xOf(place.lon)}
              cy={yOf(place.lat)}
              r={radius}
            >
              <title>{`${place.city ? `${place.city}, ` : ""}${place.country} · ${place.count}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="table-wrap obs-map-list">
        <table>
          <thead>
            <tr>
              <th>Place</th>
              <th>Requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.country}>
                <td>
                  {row.country}
                  {row.cities.size > 0 && <span className="obs-map-cities"> {[...row.cities].slice(0, 4).join(", ")}</span>}
                </td>
                <td>{row.count.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
