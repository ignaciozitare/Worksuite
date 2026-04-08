export interface GeoZone {
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
}

export interface ConfigEmpresa {
  id: string;
  horasJornadaMinutos: number;
  pausaComidaMinMinutos: number;
  pausaComidaMaxMinutos: number;
  toleranciaEntradaMinutos: number;
  diasVacacionesBase: number;
  requiereGeo: boolean;
  geoWhitelist: GeoZone[];
  ipWhitelist: string[];
  requiereAprobacionFichaje: boolean;
  slackWebhookUrl: string | null;
}
