<script setup lang="ts">
import { computed } from "vue";
import type { BreedParent, BreedPlan, BreedStep, PalId, PalRecord } from "@/core";
import BreedTreeNode from "./BreedTreeNode.vue";

const { plan, palById, number } = defineProps<{
  plan: BreedPlan;
  palById: ReadonlyMap<PalId, PalRecord>;
  number: number;
}>();

interface TreeParent {
  label: string;
  parent: BreedParent;
  source?: TreeNode;
  reused: boolean;
}

interface TreeNode {
  id: string;
  step: BreedStep;
  parents: TreeParent[];
}

const stepId = (step: BreedStep) => [
  step.ruleId,
  step.generation,
  step.parentA.palId,
  step.parentA.sex,
  step.parentB.palId,
  step.parentB.sex,
  step.child.palId,
  step.child.requiredSex ?? "any",
].join("|");

const tree = computed<TreeNode | undefined>(() => {
  const finalStep = [...plan.steps]
    .sort((a, b) => b.generation - a.generation)
    .find((step) => step.child.requiredSex === undefined) ?? plan.steps.at(-1);
  if (!finalStep) return undefined;

  const sources = new Map<string, BreedStep[]>();
  for (const step of plan.steps) {
    if (!step.child.requiredSex) continue;
    const key = `${step.child.palId}\0${step.child.requiredSex}`;
    sources.set(key, [...(sources.get(key) ?? []), step]);
  }
  const used = new Set<string>([stepId(finalStep)]);
  const build = (step: BreedStep): TreeNode => ({
    id: stepId(step),
    step,
    parents: ([step.parentA, step.parentB] as const).map((parent, index) => {
      const source = [...(sources.get(`${parent.palId}\0${parent.sex}`) ?? [])]
        .filter((candidate) => candidate.generation < step.generation)
        .sort((a, b) => b.generation - a.generation || stepId(a).localeCompare(stepId(b)))[0];
      if (!source) return { label: `亲本 ${index ? "B" : "A"}`, parent, reused: false };
      const id = stepId(source);
      if (used.has(id)) return { label: `亲本 ${index ? "B" : "A"}`, parent, reused: true };
      used.add(id);
      return { label: `亲本 ${index ? "B" : "A"}`, parent, source: build(source), reused: false };
    }),
  });
  return build(finalStep);
});
</script>

<template>
  <article class="plan-card">
    <header class="plan-card__header">
      <div>
        <p class="eyebrow">方案 {{ number }}</p>
        <h3>{{ plan.generations }} 代 · {{ plan.steps.length }} 次配种</h3>
      </div>
      <span class="generation-badge">最短 {{ plan.generations }} 代</span>
    </header>

    <BreedTreeNode v-if="tree" :node="tree" :pal-by-id="palById" />
    <p v-else class="notice">目标已经在当前起点或库存中，无需继续配种。</p>
    <p v-for="warning in plan.warnings" :key="warning" class="notice notice--warn">{{ warning }}</p>
  </article>
</template>
