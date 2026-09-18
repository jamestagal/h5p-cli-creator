export type H5PParams = Record<string, unknown>;

export interface H5PContent {
  library: string;
  params: H5PParams;
  metadata: { contentType: string; license: "U"; title: string };
  subContentId?: string;
}
