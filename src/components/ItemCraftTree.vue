<script setup lang="ts">
import ItemIcon from "./ItemIcon.vue";
import type { ItemCraftTreeNode } from "./itemCraftTree";

defineOptions({ name: "ItemCraftTree" });

const {
  node,
  ariaLabel = "完整材料树",
  nested = false,
  depth = 0,
} = defineProps<{
  node: ItemCraftTreeNode;
  ariaLabel?: string;
  /** Internal recursion marker. Consumers can leave this unset. */
  nested?: boolean;
  /** Internal recursion depth. Consumers can leave this unset. */
  depth?: number;
}>();

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
});

function formatNumber(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

function itemName(target: ItemCraftTreeNode) {
  return target.item.names.zh?.trim()
    || target.item.names.en?.trim()
    || target.item.id;
}

function childKey(child: ItemCraftTreeNode, index: number) {
  return `${child.item.id}-${child.required}-${index}`;
}

function quantityLabel(target: ItemCraftTreeNode) {
  if (target.base) return "需求";
  if (target.shared) return "本支需求";
  return "产出";
}

function headlineQuantity(target: ItemCraftTreeNode) {
  return target.base || target.shared ? target.required : target.produced;
}
</script>

<template>
  <ol v-if="!nested" class="item-craft-tree" :aria-label="ariaLabel" tabindex="0">
    <ItemCraftTree :node="node" :aria-label="ariaLabel" nested :depth="0" />
  </ol>

  <li v-else class="item-craft-tree__branch">
    <article
      class="item-craft-tree__node"
      :class="{
        'item-craft-tree__node--base': node.base,
        'item-craft-tree__node--shared': node.shared,
        'item-craft-tree__node--reference': node.reference,
      }"
    >
      <div class="item-craft-tree__card">
        <ItemIcon :item="node.item" :size="depth === 0 ? 'medium' : 'small'" />

        <div class="item-craft-tree__content">
          <header class="item-craft-tree__heading">
            <span class="item-craft-tree__identity">
              <strong>{{ itemName(node) }}</strong>
              <small>{{ node.item.names.en || node.item.id }}</small>
            </span>
            <b class="item-craft-tree__quantity"><small>{{ quantityLabel(node) }}</small> × {{ formatNumber(headlineQuantity(node)) }}</b>
          </header>

          <div class="item-craft-tree__badges" aria-label="节点类型">
            <span v-if="node.base" class="item-craft-tree__badge item-craft-tree__badge--base">
              基础原料
            </span>
            <span v-else-if="node.reference" class="item-craft-tree__badge item-craft-tree__badge--shared">
              合并引用
            </span>
            <span v-else-if="node.shared" class="item-craft-tree__badge item-craft-tree__badge--shared">
              合并制作节点
            </span>
            <span v-else class="item-craft-tree__badge item-craft-tree__badge--craft">
              制作节点
            </span>
          </div>

          <p v-if="node.reference" class="item-craft-tree__reference-note">
            已计入统一制作节点 · 合并总需求 × {{ formatNumber(node.aggregateRequired) }}
          </p>

          <dl v-else-if="!node.base" class="item-craft-tree__metrics">
            <div>
              <dt>{{ node.shared ? "合并需求" : "需求" }}</dt>
              <dd>{{ formatNumber(node.shared ? node.aggregateRequired : node.required) }}</dd>
            </div>
            <div v-if="node.shared">
              <dt>统一产出</dt>
              <dd>{{ formatNumber(node.produced) }}</dd>
            </div>
            <div>
              <dt>{{ node.shared ? "总余量" : "余量" }}</dt>
              <dd>{{ formatNumber(node.surplus) }}</dd>
            </div>
            <div>
              <dt>节点工作量</dt>
              <dd>{{ formatNumber(node.workAmount) }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <ol v-if="node.children.length" class="item-craft-tree__children">
        <ItemCraftTree
          v-for="(child, index) in node.children"
          :key="childKey(child, index)"
          :node="child"
          :aria-label="ariaLabel"
          nested
          :depth="depth + 1"
        />
      </ol>
    </article>
  </li>
</template>
