import { H5pContent } from "./h5p-content";

/**
 * Model class for H5P Interactive Book content type.
 * Represents the structure of an Interactive Book package with chapters and book cover.
 */
export class H5pInteractiveBookContent extends H5pContent {
  /**
   * Array of chapter objects containing page content
   */
  public chapters: any[] = [];

  /**
   * Book cover configuration
   */
  public bookCover: { coverDescription: string } = { coverDescription: "" };
}
