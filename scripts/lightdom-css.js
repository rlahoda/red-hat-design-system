#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { join } from 'path';
import path from 'path';
import glob from 'glob';
import sass from 'sass';
import fs from 'fs';

const __filename = join(fileURLToPath(import.meta.url), '..');
const __dirname = path.dirname(__filename);

const lightDomCss = glob(__dirname + '/elements/**/*--lightdom.scss', {}, (err, files) => {

  if (err) {
    return console.log(err);
  }

  // Might want to create a watch method on the files instead of this, as this will compile all *--lightdom.scss when
  // for all intents and purposes of developer efficiency you might only want the one you are working on.
  // That said this might be warrented for CI builds later.
  files.forEach( file => {
    const result = sass.compile(file, {sourceMap: true, style: 'compressed'});
    const filePath = path.parse(file);
    const fileName = filePath.name;
    const cssFile = join(filePath.dir,fileName + '.min.css');

    fs.writeFile(cssFile, result.css, (err) => {
      if (err) return console.log(err);
    })
  })
})