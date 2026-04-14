export interface IGeoLocationService {
  reverseGeocode(lat: number, lon: number): Promise<string | null>;
}
