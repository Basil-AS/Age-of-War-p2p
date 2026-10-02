import { mount } from 'svelte';
import App from './ui/App.svelte';
import '../app.css';
import '../ui/theme.css';

mount(App, { target: document.getElementById('app') as HTMLElement });
