import { describe, expect, it } from "vitest";
import { currentMeal } from "@/lib/domain/today";
const meals=[{id:"b",slot:"breakfast" as const,status:"planned"},{id:"l",slot:"lunch" as const,status:"planned"},{id:"s",slot:"snack" as const,status:"planned"},{id:"d",slot:"dinner" as const,status:"planned"}];
describe("prioridad visual de las comidas de hoy",()=>{
  it("destaca la comida del momento sin marcar las anteriores como hechas",()=>{
    const snapshot=JSON.stringify(meals);
    expect(currentMeal(meals,[],8*60)?.id).toBe("b");
    expect(currentMeal(meals,[],14*60)?.id).toBe("l");
    expect(currentMeal(meals,[],18*60)?.id).toBe("s");
    expect(currentMeal(meals,[],21*60)?.id).toBe("d");
    expect(JSON.stringify(meals)).toBe(snapshot);
  });
  it("no destaca un hueco ya registrado aunque el menú anterior siga previsto",()=>{
    expect(currentMeal(meals,["lunch"],14*60)?.id).toBe("s");
  });
  it("mantiene visibles las pendientes si ya se registraron las posteriores",()=>{
    expect(currentMeal(meals,["lunch","snack","dinner"],21*60)?.id).toBe("b");
  });
  it("no propone como pendiente una comida hecha, sustituida u omitida",()=>{
    expect(currentMeal(meals.map((m,i)=>({...m,status:["eaten","replaced","skipped","eaten"][i]})),[],14*60)).toBeUndefined();
  });
});
