import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NexoDB, setDbForTests, tbl } from "@/lib/db/db";
import { all, patch, put } from "@/lib/db/repo";
import { completeWorkout, reconcileCompletedWorkouts, lastPerformance, logStrengthExercise, startSession, upsertSet } from "@/lib/services/training";
import { localDate, weekStartOf } from "@/lib/domain/time";
import { weeklyVolumeByMuscle } from "@/lib/domain/training/progression";
import { findExercise } from "@/lib/domain/training/library";
import { loadDayBalance } from "@/lib/services/balance";
import { ensureInitialized, resetInitForTests } from "@/lib/db/init";
let db: NexoDB;
beforeEach(async()=>{db=new NexoDB(`recording-${crypto.randomUUID()}`);setDbForTests(db);resetInitForTests();await db.open();});
afterEach(async()=>{await db.delete();setDbForTests(null);});
const date=localDate();
async function plan(){return put("planned_items",{id:"pull",date,weekStart:weekStartOf(date),kind:"strength",title:"Tracción",intensity:"moderate",durationMin:60,sortOrder:0,status:"planned",locked:false,source:"manual",templateId:"ppl-3d",dayIndex:1});}
const options={templateId:"ppl-3d",dayIndex:1,title:"Tracción",plannedItemId:"pull",deload:false,adaptation:false};
const extra={requestId:"abs",date,startedAt:new Date().toISOString(),exerciseId:"crunch",sets:3,reps:25,weightKg:null,durationMin:null};
describe("registro real de fuerza",()=>{
  it("marcar varias series a la vez abre una sola sesión",async()=>{
    const sessions=await Promise.all([startSession(options),startSession(options),startSession(options)]);
    expect(new Set(sessions.map(s=>s.id)).size).toBe(1);
  });
  it("confirmar tracción finaliza y enlaza sin inventar series ni cambiar pesos",async()=>{
    await plan();const s=await startSession(options);
    await upsertSet({sessionId:s.id,exerciseId:"row",exerciseOrder:0,setIndex:0,weightKg:42.5,reps:12,rir:2,completed:true,isWarmup:false});
    await Promise.all([completeWorkout({plannedItemId:"pull",durationMin:45}),completeWorkout({plannedItemId:"pull",durationMin:45})]);
    expect(await all("workout_sessions")).toHaveLength(1);
    expect((await tbl("workout_sessions").get(s.id))?.status).toBe("completed");
    expect((await tbl("planned_items").get("pull"))?.actualRef?.id).toBe(s.id);
    expect(await all("exercise_sets")).toMatchObject([{weightKg:42.5,reps:12}]);
    expect((await lastPerformance(["row"])).row.sets[0].weightKg).toBe(42.5);
  });
  it("confirmación sin registros no inventa pesos ni minutos",async()=>{
    await plan();await completeWorkout({plannedItemId:"pull",durationMin:null});
    expect(await all("exercise_sets")).toHaveLength(0);
    expect((await all("workout_sessions"))[0].durationMin).toBeNull();
  });
  it("crunch 3×25 se adjunta a tracción y cuenta sin duplicar sesión ni duración",async()=>{
    await plan();const s=await completeWorkout({plannedItemId:"pull",durationMin:50});
    await Promise.all([logStrengthExercise({...extra,sessionId:s.id}),logStrengthExercise({...extra,sessionId:s.id})]);
    expect(await all("workout_sessions")).toHaveLength(1);
    const sets=await all("exercise_sets");expect(sets).toHaveLength(3);
    expect(sets.every(s=>s.completed && s.reps===25 && s.weightKg==null)).toBe(true);
    expect(weeklyVolumeByMuscle(sets,findExercise).abs).toBe(3);
    expect((await lastPerformance(["crunch"])).crunch.sets).toHaveLength(3);
    expect((await tbl("workout_sessions").get(s.id))?.durationMin).toBe(50);
  });
  it("los ejercicios independientes no completan otra sesión prevista y no generan gasto sin duración",async()=>{
    await ensureInitialized();await plan();await logStrengthExercise(extra);
    expect((await tbl("planned_items").get("pull"))?.status).toBe("planned");
    expect((await all("workout_sessions"))[0].status).toBe("completed");
    const b=await loadDayBalance(date);expect(b.exerciseToday.reduce((a,e)=>a+e.kcal,0)).toBe(0);
  });
  it("recupera el enlace de sesiones antiguas y el balance cuenta los minutos reales una sola vez",async()=>{
    await ensureInitialized();await plan();const session=await completeWorkout({plannedItemId:"pull",durationMin:50});
    await patch("planned_items","pull",{status:"planned",actualRef:null});
    await reconcileCompletedWorkouts(date);
    expect((await tbl("planned_items").get("pull"))?.status).toBe("done");
    await put("weight_entries",{date,measuredAt:new Date().toISOString(),weightKg:82,source:"manual"});
    await patch("profiles","me",{birthDate:"1990-01-01",heightCm:178,sex:"male"});
    await logStrengthExercise({...extra,sessionId:session.id});
    const b=await loadDayBalance(date);
    expect(b.energy.ok).toBe(true);expect(b.exerciseToday).toHaveLength(1);
    expect(b.energy.exercise).toBe(270);
  });
  it("rechaza datos inválidos sin guardar registros parciales",async()=>{
    await expect(logStrengthExercise({...extra,sets:2.5})).rejects.toThrow();
    await expect(logStrengthExercise({...extra,sessionId:"missing"})).rejects.toThrow();
    await expect(completeWorkout({plannedItemId:"missing",durationMin:45})).rejects.toThrow();
    expect(await all("workout_sessions")).toHaveLength(0);
  });
});
