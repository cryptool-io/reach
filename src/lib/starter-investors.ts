// A small, clearly-labeled STARTER list of well-known funds (public firm names + focus + site).
// NOT a vetted contact database and NOT 550 rows — it deliberately ships no personal emails.
// It's a seed so a Fundraising project isn't empty; use the Sourcer + enrichment to find the
// right partner and verify real contact details before any outreach.

export interface StarterInvestor {
  company: string;
  focus: string;
  website: string;
  geo: string;
}

export const STARTER_INVESTORS: StarterInvestor[] = [
  { company: 'Andreessen Horowitz (a16z)', focus: 'Generalist + crypto', website: 'https://a16z.com', geo: 'US' },
  { company: 'Sequoia Capital', focus: 'Generalist seed→growth', website: 'https://www.sequoiacap.com', geo: 'US/Global' },
  { company: 'Paradigm', focus: 'Crypto / web3', website: 'https://www.paradigm.xyz', geo: 'US' },
  { company: 'Polychain Capital', focus: 'Crypto funds & equity', website: 'https://polychain.capital', geo: 'US' },
  { company: 'Pantera Capital', focus: 'Crypto / blockchain', website: 'https://panteracapital.com', geo: 'US' },
  { company: 'Electric Capital', focus: 'Crypto early-stage', website: 'https://www.electriccapital.com', geo: 'US' },
  { company: '1confirmation', focus: 'Crypto early-stage', website: 'https://www.1confirmation.com', geo: 'US' },
  { company: 'Fabric Ventures', focus: 'Web3 / digital assets', website: 'https://fabric.vc', geo: 'EU/UK' },
  { company: 'Index Ventures', focus: 'Generalist seed→growth', website: 'https://www.indexventures.com', geo: 'EU/US' },
  { company: 'Balderton Capital', focus: 'European early-stage', website: 'https://www.balderton.com', geo: 'EU/UK' },
  { company: 'Cherry Ventures', focus: 'European seed', website: 'https://www.cherry.vc', geo: 'EU' },
  { company: 'Outlier Ventures', focus: 'Web3 accelerator/VC', website: 'https://outlierventures.io', geo: 'UK' }
];
