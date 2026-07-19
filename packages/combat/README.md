# @gameweave/combat

GameWeave 的生命、伤害、武器、弹药、hitscan、reload、projectile 与死亡结算。

```ts
const rifle = defineWeapon("rifle", { damage: { amount: 32, type: "ballistic" } });
equipWeapon(player, rifle);
```
