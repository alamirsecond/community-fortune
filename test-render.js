import dotenv from 'dotenv';
dotenv.config();

import { cloudinary } from './src/config/cloudinary.js';
import fs from 'fs';

fs.writeFileSync('test-index.html', '<h1>Hello World</h1><script>console.log("hi");</script>');

async function test() {
   try {
      const res = await cloudinary.uploader.upload('test-index.html', {
         resource_type: 'raw',
         public_id: 'games/test-render/index.html',
         overwrite: true,
         use_filename: true,
         unique_filename: false
      });
      console.log("Raw upload result:");
      console.log(res.secure_url);

      // Try auto
      try {
         const resAuto = await cloudinary.uploader.upload('test-index.html', {
            resource_type: 'auto',
            public_id: 'games/test-render-auto/index.html',
            overwrite: true
         });
         console.log("Auto upload result:");
         console.log(resAuto.secure_url);
      } catch (e) {
         console.log("Auto upload failed:", e.message);
      }

   } catch (e) {
      console.error(e);
   }
}
test();
