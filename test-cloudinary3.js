import dotenv from 'dotenv';
dotenv.config();

import { cloudinary } from './src/config/cloudinary.js';

async function test() {
  try {
    const res = await cloudinary.uploader.upload('d:/Projects/Nodjs/Community-fortune/backend/uploads/games/20ff9258-4cb7-4e5d-a208-77f36c8072ba/index.html', {
      resource_type: 'raw',
      public_id: 'games/test-render/index.html',
      overwrite: true,
      use_filename: true,
      unique_filename: false
    });
    console.log(res);

    await cloudinary.uploader.destroy('games/test-render/index.html', { resource_type: 'raw' });
  } catch(e) {
    console.error(e);
  }
}
test();
