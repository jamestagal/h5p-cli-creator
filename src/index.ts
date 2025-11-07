#!usr/bin/env node

import * as yargs from "yargs";
import { DialogCardsModule } from "./modules/csv/dialogcards-module";
import { FlashcardsModule } from "./modules/csv/flashcards-module";
import { InteractiveBookModule } from "./modules/csv/interactive-book-module";
import { InteractiveBookAIModule } from "./modules/ai/interactive-book-ai-module";

try {
  yargs
    .command(new FlashcardsModule())
    .command(new DialogCardsModule())
    .command(new InteractiveBookModule())
    .command(new InteractiveBookAIModule())
    .help().argv;
} catch (error) {
  console.error(error);
}
