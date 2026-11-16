<script lang="ts">
	import { pack } from '#lib/pack.js';
	import * as privateEnv from '$app/env/private';
	import * as publicEnv from '$app/env/public';

	const EMAIL_BACKGROUND_COLOR = privateEnv.EMAIL_BACKGROUND_COLOR ?? '';
	const EMAIL_BUTTON_COLOR = privateEnv.EMAIL_BUTTON_COLOR ?? '';
	const EMAIL_BUTTON_TEXT = privateEnv.EMAIL_BUTTON_TEXT ?? '';
	const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL ?? '';
	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

	const baseUrl = PUBLIC_BASE_URL;

	interface Props {
		title: string;
		previewText: string;
		buttonText: string;
		href: string;
		paragraphs: string[];
	}

	let { title, previewText, buttonText, href, paragraphs }: Props = $props();

	/** Inline style string; mail clients drop <style> blocks. */
	function css(style: Record<string, string>): string {
		return Object.entries(style)
			.map(
				([key, value]) =>
					`${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`,
			)
			.join(';');
	}

	const fontFamily =
		'-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif';

	const main = {
		backgroundColor: '#ffffff',
	};

	const container = {
		margin: '0 auto',
		backgroundColor: EMAIL_BACKGROUND_COLOR,
		padding: '10px 20px',
		width: '580px',
		borderRadius: '8px',
		boxShadow: '0 0 4px rgba(0, 0, 0, 0.7)',
	};

	const heading = {
		fontFamily,
		fontSize: '32px',
		lineHeight: '1.3',
		fontWeight: '700',
		color: '#484848',
		verticalAlign: 'middle',
		height: '96px',
	};

	const paragraphStyle = {
		fontFamily,
		fontSize: '18px',
		lineHeight: '1.4',
		color: '#484848',
	};

	const button = {
		fontFamily,
		backgroundColor: EMAIL_BUTTON_COLOR,
		borderRadius: '8px',
		color: EMAIL_BUTTON_TEXT,
		fontSize: '18px',
		textDecoration: 'none',
		textAlign: 'center',
		display: 'block',
		width: '100%',
	};

	const hr = {
		borderColor: '#cccccc',
		margin: '20px 0',
	};

	const footer = {
		fontFamily,
		color: '#9ca299',
		fontSize: '14px',
		marginBottom: '10px',
	};
</script>

<div
	style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">
	{previewText}
</div>
<table
	role="presentation"
	width="100%"
	cellpadding="0"
	cellspacing="0"
	style={css(main)}>
	<tbody>
		<tr>
			<td>
				<div style={css(container)}>
					<h1 style={css(heading)}>
						{#if pack.site.logoMark}
							<img
								style="float:left;vertical-align:middle;margin-right:8px"
								src={`${baseUrl}${pack.site.logoMark}`}
								width="64"
								height="64"
								alt={PUBLIC_TITLE} />
						{/if}
						{title}
					</h1>
					{#each paragraphs as paragraph, index (index)}
						<p style={css(paragraphStyle)}>{paragraph}</p>
					{/each}
					<a
						style={css({ ...button, padding: '8px 0' })}
						href="{baseUrl}{href}"
						target="_blank">
						{buttonText}
					</a>
					<hr
						style={css({
							...hr,
							borderWidth: '1px 0 0',
							borderStyle: 'solid',
						})} />
					<p style={css(footer)}>
						{PUBLIC_TITLE} · <a href={baseUrl} target="_blank">{baseUrl}</a>
					</p>
				</div>
			</td>
		</tr>
	</tbody>
</table>
