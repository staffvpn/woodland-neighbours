export interface SunState {
  elevationDeg: number;
  colorHex: string;
  intensity: number;
}

const NIGHT_COLOR = "#2b3a67";
const DAWN_DUSK_COLOR = "#f2a365";
const DAY_COLOR = "#fff6e0";

function hoursOfDay(date: Date): number {
  return date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
}

export function sunState(date: Date): SunState {
  const hours = hoursOfDay(date);
  const angle = ((hours - 6) / 24) * 2 * Math.PI;
  const elevationDeg = Math.sin(angle) * 90;
  const intensity = Math.max(0, Math.sin(angle));

  let colorHex: string;
  if (hours >= 5 && hours < 7.5) {
    colorHex = DAWN_DUSK_COLOR;
  } else if (hours >= 7.5 && hours < 17) {
    colorHex = DAY_COLOR;
  } else if (hours >= 17 && hours < 19.5) {
    colorHex = DAWN_DUSK_COLOR;
  } else {
    colorHex = NIGHT_COLOR;
  }

  return { elevationDeg, colorHex, intensity };
}
