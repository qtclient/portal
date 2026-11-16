<script lang="ts">
	import {
		faBookBookmark,
		faChevronDown,
		faCircleInfo,
		faHandshake,
		faNewspaper,
		faPeopleArrows,
		faQuestion,
		faStore,
		faUser,
	} from '@fortawesome/free-solid-svg-icons';
	import { Accordion } from '@skeletonlabs/skeleton-svelte';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import * as publicEnv from '$app/env/public';

	import Button from '#lib/components/ui/Button.svelte';
	import { siteHref } from '#lib/siteRouter.js';

	const PUBLIC_DOWNLOAD_URL = publicEnv.PUBLIC_DOWNLOAD_URL || '/download';
	const PUBLIC_PAYMENTS_URL = (publicEnv.PUBLIC_PAYMENTS_URL || '').replace(
		/\/+$/,
		'',
	);
	const PUBLIC_WIKI_URL = publicEnv.PUBLIC_WIKI_URL || '';

	interface Props {
		isLoggedIn?: boolean;
		staticPages: { title: string; slug: string }[];
	}

	let { isLoggedIn = false, staticPages }: Props = $props();

	const getCoinsHref = $derived(
		PUBLIC_PAYMENTS_URL ||
			siteHref('account', 'redirectlogin', {
				clienttarget: 'payment',
				clientselection: 'SC3',
			}),
	);
</script>

<div class="card card-tertiary card-hover overflow-hidden theme-box">
	<div class="flex flex-col gap-0 py-2 px-2 items-center">
		{#if isLoggedIn}
			<Button href={siteHref('account', 'accountmanagement')} class="w-full">
				{$_('my-account')}
			</Button>
			<form action="/account/logout" method="post" class="flex w-2/3">
				<Button
					type="submit"
					size="sm"
					variant="soft"
					color="secondary"
					class="text-white text-xs p-0.5 rounded-t-none w-full">
					{$_('logout')}
				</Button>
			</form>
		{:else}
			<Button href="/account/login" class="w-full">{$_('login')}</Button>
			<Button
				href="/account/signup"
				size="sm"
				variant="soft"
				color="secondary"
				class="text-white w-2/3 text-xs p-0.5 rounded-t-none">
				{$_('create-account')}
			</Button>
		{/if}
	</div>
	<hr class="opacity-5" />
	<div class="py-2 px-2 flex flex-col gap-1">
		<a
			href="/play"
			data-sveltekit-reload
			class="btn preset-filled-primary-500 w-full text-xs p-1 text-center">
			{$_('play')}
		</a>
		{#if PUBLIC_DOWNLOAD_URL}
			<Button
				href={PUBLIC_DOWNLOAD_URL}
				class="w-full text-xs p-1"
				variant="soft"
				color="secondary">
				{$_('download')}
			</Button>
		{/if}
	</div>
</div>

<div class="card card-tertiary text-white overflow-hidden theme-box">
	<article class="py-2 px-2">
		<Accordion
			multiple
			defaultValue={[
				'news',
				'about',
				'guides',
				'library',
				'community',
				'account',
				'trade',
				'support',
			]}>
			<Accordion.Item value="news" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faNewspaper} />
					<span class="flex-1 text-left">{$_('news')}</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li>
								<a href={siteHref('news', 'latestnews')}>{$_('latest-news')}</a>
							</li>
							<li>
								<a href={siteHref('news', 'newsarchive')}
									>{$_('news-archive.title')}</a>
							</li>
							<li>
								<a href={siteHref('news', 'eventcalendar')}
									>{$_('events.title')}</a>
							</li>
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="about" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faCircleInfo} />
					<span class="flex-1 text-left">About</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li>
								<a href={siteHref('abouttibia', 'gamefeatures')}
									>Game Features</a>
							</li>
							<li>
								<a href={siteHref('abouttibia', 'premiumfeatures')}
									>Premium Features</a>
							</li>
							<li>
								<a href={siteHref('account', 'downloadclient')}
									>{$_('download')}</a>
							</li>
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="guides" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faBookBookmark} />
					<span class="flex-1 text-left">Game Guides</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li><a href={siteHref('gameguides', 'manual')}>Manual</a></li>
							{#if PUBLIC_WIKI_URL}
								<li>
									<a href={PUBLIC_WIKI_URL} target="_blank" rel="noreferrer"
										>Wiki</a>
								</li>
							{/if}
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="library" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faBookBookmark} />
					<span class="flex-1 text-left">{$_('library')}</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							{#each staticPages as page}
								<li>
									<a href={siteHref('library', `page:${page.slug}`)}
										>{page.title}</a>
								</li>
							{/each}
							{#if staticPages.length === 0}
								<li>
									<a href={siteHref('library', 'creatures')}>Creatures</a>
								</li>
							{/if}
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="community" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faPeopleArrows} />
					<span class="flex-1 text-left">{$_('community')}</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li>
								<a href={siteHref('community', 'characters')}
									>{$_('characters')}</a>
							</li>
							<li>
								<a href={siteHref('community', 'worlds')}
									>{$_('whos-online')}</a>
							</li>
							<li>
								<a href={siteHref('community', 'highscores')}
									>{$_('highscores')}</a>
							</li>
							<li>
								<a href={siteHref('community', 'guilds')}
									>{$_('guilds.title')}</a>
							</li>
							<li>
								<a href={siteHref('community', 'houses')}
									>{$_('houses.title')}</a>
							</li>
							<li>
								<a href={siteHref('community', 'killstatistics')}
									>{$_('last-kills.title')}</a>
							</li>
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="account" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faUser} />
					<span class="flex-1 text-left">Account</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li>
								<a href="/account/login">Account Management</a>
							</li>
							<li>
								<a href="/account/signup">Create Account</a>
							</li>
							<li>
								<a href={siteHref('account', 'lostaccount')}>Lost Account</a>
							</li>
							<li>
								<a href={getCoinsHref}>Get Coins</a>
							</li>
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="trade" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faStore} />
					<span class="flex-1 text-left">Char Bazaar</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li>
								<a href={siteHref('charactertrade', 'currentcharactertrades')}
									>{$_('bazaar.current')}</a>
							</li>
							<li>
								<a href={siteHref('charactertrade', 'pastcharactertrades')}
									>{$_('bazaar.past')}</a>
							</li>
							{#if isLoggedIn}
								<li>
									<a href={siteHref('charactertrade', 'owncharactertrades')}
										>{$_('bazaar.my-auctions')}</a>
								</li>
								<li>
									<a href={siteHref('charactertrade', 'ownbids')}
										>{$_('bazaar.my-bids')}</a>
								</li>
							{/if}
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>

			<Accordion.Item value="support" class="accordion-item">
				<Accordion.ItemTrigger
					class="accordion-control flex w-full items-center gap-2">
					<Fa icon={faQuestion} />
					<span class="flex-1 text-left">Support</span>
					<Accordion.ItemIndicator
						class="transition-transform data-[state=open]:rotate-180">
						<Fa icon={faChevronDown} size="xs" />
					</Accordion.ItemIndicator>
				</Accordion.ItemTrigger>
				<Accordion.ItemContent class="accordion-panel">
					<nav class="list-nav">
						<ul>
							<li><a href={siteHref('support', 'faq')}>FAQ</a></li>
							<li><a href={siteHref('support', 'tibiarules')}>Rules</a></li>
							<li>
								<a href={siteHref('support', 'contact')}>
									<Fa icon={faHandshake} class="inline mr-1" />Contact
								</a>
							</li>
						</ul>
					</nav>
				</Accordion.ItemContent>
			</Accordion.Item>
		</Accordion>
	</article>
</div>
