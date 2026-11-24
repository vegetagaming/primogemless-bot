import test from 'node:test';
import assert from 'node:assert/strict';
import {Resvg} from '@resvg/resvg-js';
import {CardRenderer,assertCardFont} from '../src/render.mjs';

test('balance PNG contains visible numeric glyphs in every amount region, including zero and large balances',async()=>{
 const card=await new CardRenderer(null).render({type:'balance',uid:'712345678',subtitle:'Font regression check',footer:'Saved balances',welkinDays:179,metrics:[{key:'primogems',label:'Primogems',value:'1,000,000,000'},{key:'crystals',label:'Genesis Crystals',value:'300'},{key:'acquaint',label:'Acquaint Fates',value:'0'},{key:'intertwined',label:'Intertwined Fates',value:'25'}]});
 // Decode the actual PNG, so an SVG with text but an empty font render cannot pass.
 const pixels=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><image width="1200" height="720" href="data:image/png;base64,'+card.png().toString('base64')+'"/></svg>').render().pixels;
 for(const [x,y]of [[203,236],[767,236],[203,410],[767,410]]){
  let visible=0;for(let dy=0;dy<50;dy++)for(let dx=0;dx<350;dx++){const p=((y+dy)*1200+x+dx)*4;if(pixels[p]>220&&pixels[p+1]>220&&pixels[p+2]>220&&pixels[p+3]>0)visible++;}
  assert.ok(visible>80,'Numeric glyphs missing from amount at '+x+','+y);
 }
});

test('missing fonts reject image generation rather than silently producing an image without text',()=>{
 assert.throws(()=>assertCardFont({loadSystemFonts:false,fontFiles:[],defaultFontFamily:'Intentionally Missing'}),/CARD_FONT_UNAVAILABLE/);
 assert.doesNotThrow(()=>assertCardFont());
});
