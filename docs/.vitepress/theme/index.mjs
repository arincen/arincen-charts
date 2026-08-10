/**
 * The docs theme.
 *
 * Two additions to the default and no fork of it: a component that runs the
 * code it prints, and a live chart in the slot the hero keeps for an image.
 * Everything else is VitePress with Arincen's palette applied over it, which
 * is a stylesheet rather than a theme to maintain.
 */
import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import ChartDemo from './ChartDemo.vue';
import HeroChart from './HeroChart.vue';
import './custom.css';

export default {
    extends: DefaultTheme,

    Layout() {
        return h(DefaultTheme.Layout, null, {
            'home-hero-image': () => h(HeroChart),
        });
    },

    enhanceApp({ app }) {
        app.component('ChartDemo', ChartDemo);
    },
};
