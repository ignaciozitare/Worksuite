import type { IGeoLocationService } from '../domain/ports/IGeoLocationService';

export class NominatimGeoLocationService implements IGeoLocationService {
  async reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      );
      const data = await res.json();
      return data.address?.city || data.address?.town || data.address?.village || null;
    } catch {
      return null;
    }
  }
}
