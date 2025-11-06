#!usr/bin/env node

import * as yargs from "yargs";
import { DialogCardsModule } from "./dialogcards-module";
import { FlashcardsModule } from "./flashcards-module";
import { InteractiveBookModule } from "./interactive-book-module";

try {
  yargs
    .command(new FlashcardsModule())
    .command(new DialogCardsModule())
    .command(new InteractiveBookModule())
    .help().argv;
} catch (error) {
  console.error(error);
}
