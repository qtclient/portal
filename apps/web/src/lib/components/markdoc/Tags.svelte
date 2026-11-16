<!-- adapted from https://github.com/movingbrands/svelte-portable-text -->
<script lang="ts">
	import {
		default as Markdoc,
		type RenderableTreeNode,
	} from '@markdoc/markdoc';

	import Callout from './Callout.svelte';
	import Tags from './Tags.svelte';

	type ComponentType = typeof Callout;

	interface Props {
		node: RenderableTreeNode | RenderableTreeNode[];
		components: Map<string, ComponentType>;
		isRoot?: boolean;
	}

	let { node, components, isRoot = false }: Props = $props();

	const nodeName = (node: RenderableTreeNode | RenderableTreeNode[]) => {
		if (typeof node === 'string' || typeof node === 'number') return 'text';
		if (Array.isArray(node)) return 'fragment';
		if (node === null || typeof node !== 'object') return 'empty';
		if (!Markdoc.Tag.isTag(node)) return 'empty';
		return node.name;
	};

	const filterAttributes = (attributes: Record<string, unknown>) => {
		// Filter out any attributes that might cause type conflicts
		const filtered: Record<string, unknown> = {};
		const validKeys = ['center'];

		for (const [key, value] of Object.entries(attributes)) {
			if (validKeys.includes(key)) {
				filtered[key] = value;
			}
		}

		return filtered as Record<string, never>;
	};
</script>

{#if typeof node === 'string' || typeof node === 'number'}
	{@html node}
{:else if Array.isArray(node)}
	{#each node as child}
		<Tags node={child} {components} />
	{/each}
{:else if node === null || typeof node !== 'object' || !Markdoc.Tag.isTag(node)}
	{''}
{:else if !node.name}
	<Tags node={node.children} {components} />
{:else if components.has(nodeName(node))}
	{@const component = components.get(nodeName(node))}
	{@const filteredAttrs = filterAttributes(
		node.attributes as Record<string, unknown>,
	)}
	{@const Component = component!}
	<Component {...filteredAttrs}>
		<Tags node={node.children} {components} />
	</Component>
{:else if node.children.length > 0}
	{#if isRoot}
		<Tags node={node.children} {components} />
	{:else}
		<svelte:element this={node.name} {...node.attributes}>
			<Tags node={node.children} {components} />
		</svelte:element>
	{/if}
{:else}
	<svelte:element this={node.name} {...node.attributes} />
{/if}
