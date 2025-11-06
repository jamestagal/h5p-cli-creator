import * as fs from "fs";
import * as papa from "papaparse";
import * as path from "path";
import * as yargs from "yargs";

import { InteractiveBookCreator } from "./interactive-book-creator";
import { H5pPackage } from "./h5p-package";

/**
 * Yargs module for Interactive Book content type.
 * Handles CLI command parsing and orchestrates H5P package creation.
 */
export class InteractiveBookModule implements yargs.CommandModule {
  public command = "interactivebook <input> <output>";
  public describe =
    "Converts csv input to h5p Interactive Book content. \
    Columns: bookTitle, pageTitle, pageText, [imagePath], [imageAlt], [audioPath]";

  public builder = (y: yargs.Argv) =>
    y
      .positional("input", { describe: "csv input file" })
      .positional("output", { describe: "h5p output file including .h5p extension" })
      .option("l", {
        describe: "language for translations",
        default: "en",
        type: "string",
      })
      .option("d", { describe: "CSV delimiter", default: ",", type: "string" })
      .option("e", { describe: "encoding", default: "UTF-8", type: "string" })
      .option("t", {
        describe: "book title (overrides CSV)",
        type: "string",
      });

  public handler = async (argv) => {
    await this.runInteractiveBook(
      argv.input,
      argv.output,
      argv.t,
      argv.e,
      argv.d,
      argv.l
    );
  };

  private async runInteractiveBook(
    csvfile: string,
    outputfile: string,
    titleOverride: string | undefined,
    encoding: BufferEncoding,
    delimiter: string,
    language: string
  ): Promise<void> {
    console.log("Creating Interactive Book content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    let csv = fs.readFileSync(csvfile, encoding);
    let csvParsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    let h5pPackage = await H5pPackage.createFromHub("H5P.InteractiveBook", language);
    let bookCreator = new InteractiveBookCreator(
      h5pPackage,
      csvParsed.data as any,
      titleOverride,
      path.dirname(csvfile)
    );
    await bookCreator.create();
    bookCreator.savePackage(outputfile);
  }
}
