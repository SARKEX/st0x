<script lang="ts">
	import {
		Table,
		TableBody,
		TableBodyCell,
		TableBodyRow,
		TableHead,
		TableHeadCell
	} from 'flowbite-svelte';

	export let csvFromIpfs: string = '';
	let tableData: string[][] = [];

	$: tableData = parseCSV(csvFromIpfs);

	function parseCSV(csvText: string): string[][] {
		const rows = csvText.trim().split('\n');
		return rows.map((row) => row.split(','));
	}
</script>

<Table>
	<TableHead>
		{#each tableData[0] as header}
			<TableHeadCell>{header}</TableHeadCell>
		{/each}
	</TableHead>
	<TableBody tableBodyClass="divide-y">
		{#each tableData.slice(1) as row}
			<TableBodyRow>
				{#each row as cell}
					<TableBodyCell tdClass="whitespace-wrap border-1">{cell}</TableBodyCell>
				{/each}
			</TableBodyRow>
		{/each}
	</TableBody>
</Table>
