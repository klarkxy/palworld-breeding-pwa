<script setup lang="ts">
import type { BreedParent, BreedStep, PalId, PalRecord } from "@/core";
import PalChip from "./PalChip.vue";

defineOptions({ name: "BreedTreeNode" });

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

defineProps<{
  node: TreeNode;
  palById: ReadonlyMap<PalId, PalRecord>;
}>();

const originText = (parent: BreedParent) => parent.origin === "owned"
  ? "库存已有"
  : parent.origin === "recommended"
    ? "外部推荐配偶"
    : "由下方步骤孵出";
</script>

<template>
  <article class="dependency-node">
    <header class="dependency-node__equation">
      <span class="generation-badge">第 {{ node.step.generation }} 代</span>
      <PalChip :pal="palById.get(node.step.parentA.palId)" :sex="node.step.parentA.sex" :muted="node.step.parentA.origin === 'recommended'" />
      <span class="operator" aria-label="加">＋</span>
      <PalChip :pal="palById.get(node.step.parentB.palId)" :sex="node.step.parentB.sex" :muted="node.step.parentB.origin === 'recommended'" />
      <span class="operator" aria-label="等于">＝</span>
      <span class="dependency-node__child">
        <PalChip :pal="palById.get(node.step.child.palId)" :sex="node.step.child.requiredSex" />
        <small v-if="node.step.child.requiredSex">需{{ node.step.child.requiredSex === "M" ? "雄" : "雌" }}</small>
      </span>
    </header>

    <ol class="dependency-branches" aria-label="亲本来源">
      <li v-for="branch in node.parents" :key="`${node.id}-${branch.label}`">
        <p class="dependency-branch__label">{{ branch.label }} · {{ originText(branch.parent) }}</p>
        <div v-if="branch.reused" class="dependency-reuse">
          <span class="reuse-badge">复用</span>
          <PalChip :pal="palById.get(branch.parent.palId)" :sex="branch.parent.sex" />
          <small>已在另一支线孵出</small>
        </div>
        <BreedTreeNode v-else-if="branch.source" :node="branch.source" :pal-by-id="palById" />
        <div v-else class="dependency-leaf">
          <PalChip :pal="palById.get(branch.parent.palId)" :sex="branch.parent.sex" :muted="branch.parent.origin === 'recommended'" />
          <small>{{ originText(branch.parent) }}</small>
        </div>
      </li>
    </ol>
  </article>
</template>
