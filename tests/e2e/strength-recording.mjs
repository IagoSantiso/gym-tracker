/** Tracción + abdominales: guardado real, confirmación, balance, referencia y modo offline. */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const port=3218,base=`http://localhost:${port}`;
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p",String(port)],{stdio:["ignore","pipe","pipe"]});
let browser;
try {
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("Server timeout")),30000);server.stdout.on("data",d=>{if(/Ready/.test(String(d))){clearTimeout(t);resolve();}});server.stderr.on("data",d=>process.stderr.write(d));});
  browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await ctx.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.stack));
  await page.goto(base,{waitUntil:"networkidle"});
  await page.getByRole("heading",{name:"Tu energía de hoy",exact:true}).waitFor();
  assert.ok((await page.locator(".today-energy").boundingBox()).y < (await page.locator(".today-agenda").boundingBox()).y);
  // Synthetic profile and weight, in this isolated test browser only.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open("nexo");r.onsuccess=()=>{const db=r.result,t=db.transaction(["profiles","weight_entries"],"readwrite"),profiles=t.objectStore("profiles"),p=profiles.get("me"),now=new Date().toISOString();p.onsuccess=()=>profiles.put({...p.result,birthDate:"1990-01-01",heightCm:178,sex:"male"});t.objectStore("weight_entries").put({id:"synthetic-weight",date:now.slice(0,10),measuredAt:now,weightKg:82,source:"manual",createdAt:now,updatedAt:now});t.oncomplete=()=>{db.close();resolve();};t.onerror=()=>reject(t.error);};}));
  await page.reload({waitUntil:"networkidle"});
  await page.getByRole("button",{name:"Registrar",exact:true}).click();await page.getByRole("button",{name:"Comida",exact:true}).click();
  await page.getByRole("button",{name:"Solo etiqueta",exact:true}).click();await page.getByLabel("Descripción",{exact:true}).fill("Comida sintética de prueba");await page.getByLabel("Energía",{exact:true}).fill("600");
  await page.getByRole("button",{name:"Guardar",exact:true}).click();await page.getByText("Comida registrada",{exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector(".today-energy-values strong")?.textContent.includes("600"));
  await page.goto(base+"/entrenamiento/sesion?t=ppl-3d&d=1",{waitUntil:"networkidle"});
  await page.getByLabel("Peso serie 1 (kg)").first().fill("42,5");await page.getByLabel("Repeticiones serie 1",{exact:true}).first().fill("12");
  await page.getByRole("button",{name:"Serie 1 pendiente",exact:true}).first().click();
  await page.getByRole("button",{name:"Serie 1 hecha",exact:true}).first().waitFor();
  await page.getByRole("button",{name:"Añadir ejercicio extra"}).click();
  await page.getByLabel("Buscar ejercicio",{exact:true}).fill("crunch abdominal");
  await page.getByLabel("Ejercicio realizado",{exact:true}).selectOption("crunch");
  await page.getByRole("button",{name:"Guardar ejercicio realizado",exact:true}).click();
  await page.getByText("Ejercicio guardado: ya cuenta en Hoy y en tu progreso",{exact:true}).waitFor();
  await page.goto(base,{waitUntil:"networkidle"});
  const row=page.locator('.today-session[data-status="in_progress"]').filter({hasText:"Tracción"});
  await row.locator(":scope > summary").click();
  assert.match(await row.textContent(),/Crunch abdominal/);
  await row.getByRole("button",{name:"Ya la he realizado",exact:true}).click();
  await page.getByLabel("Duración total real",{exact:true}).fill("50");
  await page.getByRole("button",{name:"Confirmar sesión realizada",exact:true}).click();
  await page.getByText("Sesión completada: ya cuenta en Hoy",{exact:true}).waitFor();
  const done=page.locator('.today-session[data-status="completed"]').filter({hasText:"Tracción"});await done.waitFor();
  assert.equal(await page.locator('.today-session[data-status="in_progress"]').count(),0);
  assert.match(await done.textContent(),/42.5 kg × 12/);
  assert.match(await done.textContent(),/25 · 25 · 25/);
  // The browser database contains one actual workout and all four real sets.
  const data=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open("nexo");r.onsuccess=()=>{const db=r.result,t=db.transaction(["workout_sessions","exercise_sets"],"readonly"),s=t.objectStore("workout_sessions").getAll(),e=t.objectStore("exercise_sets").getAll();t.oncomplete=()=>{resolve({sessions:s.result.filter(x=>!x.deletedAt),sets:e.result.filter(x=>!x.deletedAt)});db.close();};t.onerror=()=>reject(t.error);};}));
  assert.equal(data.sessions.length,1);assert.equal(data.sets.length,4);assert.equal(data.sessions[0].durationMin,50);
  await page.waitForFunction(()=>document.querySelector(".today-energy")?.textContent.includes("270"));
  for(let i=0;i<3 && await page.locator(".toast-item").count();i++)await page.locator(".toast-item").first().click();
  mkdirSync("tests/e2e/screenshots",{recursive:true});await page.screenshot({path:"tests/e2e/screenshots/today-strength-mobile.png",fullPage:true});
  await page.goto(base+"/entrenamiento/sesion?t=ppl-3d&d=1",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Peso serie 1 (kg)"]')?.value==="42,5");
  assert.equal(await page.getByLabel("Peso serie 1 (kg)").first().inputValue(),"42,5");
  console.log("PASS tracción + crunch 3×25: una sesión, cuatro series, guardado y última carga rellenada");
  await page.goto(base,{waitUntil:"networkidle"});await ctx.setOffline(true);await page.reload({waitUntil:"networkidle"});
  await page.locator('.today-session[data-status="completed"]').first().waitFor();
  await page.getByRole("button",{name:"Añadir actividad"}).click();await page.getByLabel("Buscar ejercicio",{exact:true}).fill("crunch abdominal");await page.getByLabel("Ejercicio realizado",{exact:true}).selectOption("crunch");
  await page.getByRole("button",{name:"Guardar ejercicio realizado",exact:true}).click();await page.getByText("Ejercicio guardado: ya cuenta en Hoy y en tu progreso",{exact:true}).waitFor();
  await page.reload({waitUntil:"networkidle"});assert.equal(await page.locator('.today-session[data-status="completed"]').count(),2);
  for(const width of [320,768,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`no overflow at ${width}px`);}
  assert.deepEqual(errors,[]);console.log("PASS añadir fuerza sin IA en modo avión, persistencia y tamaños 320/768/1280");
} finally {await browser?.close();server.kill();}
