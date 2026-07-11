<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import DataState from "@/components/DataState.vue";
import EggshellCard from "@/components/EggshellCard.vue";
import PalIcon from "@/components/PalIcon.vue";
import { useCollection } from "@/composables/useCollection";
import { elementName, formatDex, isSelectablePal, usePalData, workName } from "@/composables/usePalData";

const route = useRoute();
const router = useRouter();
const { palById, isLoading, error, load } = usePalData();
const { entries, setSex } = useCollection();
const id = computed(() => Array.isArray(route.params.id) ? route.params.id[0] : route.params.id);
const pal = computed(() => {
  const candidate = palById.value.get(id.value ?? "");
  return candidate && isSelectablePal(candidate) ? candidate : undefined;
});
const owned = computed(() => entries.value.find((entry) => entry.palId === pal.value?.id));
const malePercent = computed(() => {
  const value = pal.value?.maleProbability ?? 0.5;
  return Math.round(value <= 1 ? value * 100 : value);
});

const statLabels: Record<string, string> = { hp: "生命", attack: "攻击", defense: "防御", stamina: "体力", support: "支援", speed: "速度" };
const statName = (value: string) => statLabels[value.toLocaleLowerCase()] ?? value;

function openCalculator(kind: "parent" | "target") {
  if (!pal.value) return;
  router.push(kind === "parent"
    ? { path: "/breeding", query: { mode: "forward", a: pal.value.id } }
    : { path: "/breeding", query: { mode: "pairs", target: pal.value.id } });
}
</script>

<template>
  <main class="page-shell">
    <DataState :is-loading :error @retry="load">
      <div v-if="pal" class="paldex-detail">
        <RouterLink to="/paldex" class="back-link">← 返回图鉴</RouterLink>
        <EggshellCard tone="sky" class="detail-hero">
          <div class="detail-hero__art"><PalIcon :pal size="large" /></div>
          <div class="detail-hero__copy">
            <p class="eyebrow">{{ formatDex(pal) }} · {{ pal.id }}</p>
            <h1>{{ pal.names.zh }}</h1><p class="detail-english">{{ pal.names.en }}</p>
            <div class="tag-row"><span v-for="item in pal.elements" :key="item" class="tag">{{ elementName(item) }}</span><span v-if="pal.variant" class="tag tag--coral">亚种</span></div>
            <div class="detail-actions">
              <button class="button button--primary" type="button" @click="openCalculator('parent')">设为亲本 A</button>
              <button class="button button--secondary" type="button" @click="openCalculator('target')">查全部父母组合</button>
            </div>
          </div>
          <fieldset class="detail-owned">
            <legend>加入我的帕鲁</legend>
            <label class="sex-toggle sex-toggle--male"><input type="checkbox" :checked="owned?.male ?? false" @change="setSex(pal.id, 'male', ($event.target as HTMLInputElement).checked)" /><span>♂ 雄</span></label>
            <label class="sex-toggle sex-toggle--female"><input type="checkbox" :checked="owned?.female ?? false" @change="setSex(pal.id, 'female', ($event.target as HTMLInputElement).checked)" /><span>♀ 雌</span></label>
          </fieldset>
        </EggshellCard>

        <div class="detail-grid">
          <EggshellCard><p class="eyebrow">基础数值</p><h2>身体档案</h2><dl class="stat-grid"><div v-for="(value, key) in pal.stats" :key="key"><dt>{{ statName(key) }}</dt><dd>{{ value }}</dd></div><div><dt>雄性概率</dt><dd>{{ malePercent }}%</dd></div><div><dt>配种力</dt><dd>{{ pal.breedingPower }}</dd></div></dl></EggshellCard>
          <EggshellCard><p class="eyebrow">工作适应性</p><h2>据点分工</h2><ul v-if="Object.keys(pal.workSuitability).length" class="level-list"><li v-for="(level, work) in pal.workSuitability" :key="work"><span>{{ workName(work) }}</span><strong>Lv.{{ level }}</strong></li></ul><p v-else class="muted-copy">没有记录工作适应性。</p></EggshellCard>
          <EggshellCard><p class="eyebrow">伙伴技能</p><h2>{{ pal.partnerSkill || "暂无记录" }}</h2><p class="muted-copy">技能效果以游戏内当前版本说明为准。</p></EggshellCard>
          <EggshellCard><p class="eyebrow">主动技能</p><h2>可用招式</h2><ul v-if="pal.activeSkills.length" class="skill-list"><li v-for="skill in pal.activeSkills" :key="skill">{{ skill }}</li></ul><p v-else class="muted-copy">暂无主动技能数据。</p></EggshellCard>
        </div>
      </div>
      <div v-else class="empty-state"><span aria-hidden="true">?</span><p>图鉴中没有这个帕鲁。</p><RouterLink class="button button--primary" to="/paldex">返回图鉴</RouterLink></div>
    </DataState>
  </main>
</template>
