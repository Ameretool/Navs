<script lang="ts">
  import { tick } from 'svelte'
  import { cloneSettingsForm, type SettingsFormModel } from '../../lib/settingsForm'

  export let form: SettingsFormModel
  export let saving = false

  async function syncForm(): Promise<void> {
    await tick()
    form = cloneSettingsForm(form)
  }
</script>

<fieldset id="settings-section-search-display" class="group group-wide" disabled={saving}>
  <legend>首页显示</legend>
  <p class="group-desc">控制首页标题、搜索入口和「经常访问」区域的显示方式。</p>

  <div class="form-grid search-display-grid">
    <label class="field field-range">
      <span>经常访问展示数量 <em>{form.most_visited_count === 0 ? '已禁用' : form.most_visited_count}</em></span>
      <input
        bind:value={form.most_visited_count}
        type="range"
        min="0"
        max="20"
        step="1"
        on:input={() => void syncForm()}
      />
      <small>设置首页顶部「经常访问」区域展示的书签上限。设为 0 可完全隐藏该区域。</small>
    </label>

    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示站点标题</span>
        <p>关闭后首页不再展示大标题字样。</p>
      </div>
      <input
        bind:checked={form.site_title_show}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </label>

    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示搜索框</span>
        <p>关闭后首页隐藏整个搜索区域，只显示标题、导航与书签内容。</p>
      </div>
      <input
        bind:checked={form.search_box_show}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </label>

    <label class="toggle-field field-toggle">
      <div class="toggle-copy">
        <span>显示引擎选择器</span>
        <p>关闭后搜索框直接使用下方设置的默认搜索引擎。</p>
      </div>
      <input
        bind:checked={form.search_engine_selector_show}
        on:change={() => void syncForm()}
        type="checkbox"
      />
    </label>
  </div>
</fieldset>

<style>
  .field-range {
    grid-column: 1 / -1;
  }

  .field-toggle {
    grid-column: span 4;
  }

  @media (max-width: 960px) {
    .field-toggle {
      grid-column: 1 / -1;
    }
  }
</style>
