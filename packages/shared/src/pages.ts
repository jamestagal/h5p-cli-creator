import { z } from "zod";

const PageBase = z.object({ title: z.string().min(1).max(200) });

export const TextPage = PageBase.extend({ type: z.literal("text"), html: z.string().min(1) });
export const ImagePage = PageBase.extend({ type: z.literal("image"), assetId: z.string().min(1), alt: z.string().min(1), caption: z.string().optional() });
export const AudioPage = PageBase.extend({ type: z.literal("audio"), assetId: z.string().min(1), autoplay: z.boolean().default(false) });
export const VideoPage = PageBase.extend({
  type: z.literal("video"),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("asset"), assetId: z.string().min(1) }),
    z.object({ kind: z.literal("url"), url: z.url() })
  ])
});

export const Page = z.discriminatedUnion("type", [TextPage, ImagePage, AudioPage, VideoPage]);
export type Page = z.infer<typeof Page>;
export type TextPage = z.infer<typeof TextPage>;
export type ImagePage = z.infer<typeof ImagePage>;
export type AudioPage = z.infer<typeof AudioPage>;
export type VideoPage = z.infer<typeof VideoPage>;
