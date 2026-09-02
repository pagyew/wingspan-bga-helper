// Payment enumeration: every distinct legal way to spend a resource, so
// legalMoves can offer each as its own move rather than the engine picking
// one greedily. Pure, no state — callers hand in the capacities.
import { FOODS } from '../engine/scoring.js';

export { FOODS };

/**
 * Every allocation of `want` units across `capacities` (one entry per slot,
 * alloc[i] <= capacities[i]). Small inputs only — this is move enumeration,
 * not a solver, and Wingspan's costs and egg requirements are 0..4.
 */
export function chooseAllocations(capacities, want) {
  const n = capacities.length;
  const results = [];
  const current = new Array(n).fill(0);
  (function rec(i, remaining) {
    if (i === n) {
      if (remaining === 0) results.push(current.slice());
      return;
    }
    const maxTake = Math.min(capacities[i], remaining);
    for (let take = 0; take <= maxTake; take++) {
      current[i] = take;
      rec(i + 1, remaining - take);
    }
    current[i] = 0;
  })(0, want);
  return results;
}

/**
 * Every distinct food array (length 5, indices per FOODS) a seat could spend
 * from `food` to pay `bird`'s cost. Handles the fixed cost + wild tokens
 * shape and the 31 "1 X or 1 Y" cards (totalFood < sum of cost + wild — see
 * evaluate.js's canPay/payFood, which this generalizes into an enumeration
 * instead of one greedy answer).
 */
export function foodPayments(food, bird) {
  const cost = bird.food;
  const wild = bird.foodWild || 0;
  const fixedSum = cost.reduce((a, x) => a + x, 0);
  const isOr = bird.totalFood != null && fixedSum + wild > bird.totalFood;

  if (isOr) {
    const types = FOODS.map((_, i) => i).filter(i => cost[i] > 0);
    const capacities = types.map(i => food[i]);
    return chooseAllocations(capacities, bird.totalFood).map(alloc => {
      const spend = [0, 0, 0, 0, 0];
      types.forEach((i, j) => { spend[i] = alloc[j]; });
      return spend;
    });
  }

  if (FOODS.some((_, i) => food[i] < cost[i])) return [];
  const afterFixed = food.map((n, i) => n - cost[i]);
  return chooseAllocations(afterFixed, wild).map(extra =>
    cost.map((c, i) => c + extra[i])
  );
}

export function spendFood(food, spend) {
  return food.map((n, i) => n - spend[i]);
}

export function gainFood(food, spend) {
  return food.map((n, i) => n + spend[i]);
}
