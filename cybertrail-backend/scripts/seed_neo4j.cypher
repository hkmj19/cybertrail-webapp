// scripts/seed_neo4j.cypher
// ──────────────────────────
// Seeds the Neo4j database with sample investigation data for development.
// Run with: cypher-shell -u neo4j -p cybertrail123 < scripts/seed_neo4j.cypher
//
// Creates a realistic multi-layer fraud scenario:
//   - A BTC wallet connected to a mule UPI chain
//   - A shell company owned by the same person
//   - A phone hub linking all layers

// ── Clean slate ──────────────────────────────────────────
MATCH (n) DETACH DELETE n;

// ── Crypto layer - Bitcoin wallets ───────────────────────
CREATE (w1:Wallet {
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2498gq8yh8d24',
    label: 'bc1qxy…d24',
    chain: 'btc',
    flagged: true,
    node_type: 'wallet_btc',
    balance_btc: 2.34
});

CREATE (w2:Wallet {
    address: 'bc1qm3kvlal5dq12mksgdqmtest456',
    label: 'bc1qm3…456',
    chain: 'btc',
    flagged: false,
    node_type: 'wallet_btc',
    balance_btc: 0.45
});

CREATE (w3:Wallet {
    address: 'bc1qpptestflagged789',
    label: 'bc1qpp…789',
    chain: 'btc',
    flagged: true,
    node_type: 'wallet_btc'
});

// Crypto transactions
MATCH (a:Wallet {address: 'bc1qxy2kgdygjrsqtzq2n0yrf2498gq8yh8d24'})
MATCH (b:Wallet {address: 'bc1qm3kvlal5dq12mksgdqmtest456'})
CREATE (a)-[:CRYPTO_TX {
    amount: 11000000,
    currency: 'BTC',
    label: '₹1.1 Cr',
    tx_hash: 'abc123def456',
    timestamp: datetime('2024-01-15T10:30:00')
}]->(b);

MATCH (a:Wallet {address: 'bc1qm3kvlal5dq12mksgdqmtest456'})
MATCH (b:Wallet {address: 'bc1qpptestflagged789'})
CREATE (a)-[:CRYPTO_TX {
    amount: 8000000,
    currency: 'BTC',
    label: '₹0.8 Cr',
    tx_hash: 'def789ghi012',
    timestamp: datetime('2024-01-16T08:15:00')
}]->(b);

// ── UPI layer - mule chain ───────────────────────────────
CREATE (u1:UpiAccount {
    upi_id: 'fraud@paytm',
    label: 'fraud@paytm',
    flagged: true,
    complaint_count: 7,
    node_type: 'upi_account'
});

CREATE (u2:UpiAccount {
    upi_id: 'mule1@ybl',
    label: 'mule1@ybl',
    flagged: true,
    complaint_count: 3,
    node_type: 'upi_account'
});

CREATE (u3:UpiAccount {
    upi_id: 'mule2@oksbi',
    label: 'mule2@oksbi',
    flagged: true,
    complaint_count: 2,
    node_type: 'upi_account'
});

CREATE (b1:BankAccount {
    account_number: '1234567890HDFC',
    label: 'HDFC …890',
    flagged: false,
    node_type: 'bank_account'
});

// UPI transactions
MATCH (a:UpiAccount {upi_id: 'fraud@paytm'})
MATCH (b:UpiAccount {upi_id: 'mule1@ybl'})
CREATE (a)-[:UPI_TX {
    amount: 900000,
    currency: 'INR',
    label: '₹9 L',
    complaint_id: 'FIR-2024-001',
    timestamp: datetime('2024-01-10T14:20:00')
}]->(b);

MATCH (a:UpiAccount {upi_id: 'fraud@paytm'})
MATCH (b:UpiAccount {upi_id: 'mule2@oksbi'})
CREATE (a)-[:UPI_TX {
    amount: 800000,
    currency: 'INR',
    label: '₹8 L',
    complaint_id: 'FIR-2024-002',
    timestamp: datetime('2024-01-11T09:45:00')
}]->(b);

// ── Social layer - phone hub ─────────────────────────────
CREATE (p1:Phone {
    number: '9000000000',
    label: '+91 9000000000',
    flagged: true,
    complaint_count: 4,
    node_type: 'phone'
});

CREATE (p2:Phone {
    number: '9000000001',
    label: '+91 9000000001',
    flagged: false,
    node_type: 'phone'
});

// Phone linked to UPI accounts (shared registration)
MATCH (ph:Phone {number: '9000000000'})
MATCH (u:UpiAccount {upi_id: 'fraud@paytm'})
CREATE (ph)-[:REGISTERED]->(u);

MATCH (ph:Phone {number: '9000000000'})
MATCH (u:UpiAccount {upi_id: 'mule1@ybl'})
CREATE (ph)-[:REGISTERED]->(u);

MATCH (p:Phone {number: '9000000000'})
MATCH (q:Phone {number: '9000000001'})
CREATE (p)-[:CALLED {frequency: 42, timestamp: datetime('2024-01-12')}]->(q);

// ── Shell company layer ───────────────────────────────────
CREATE (c1:Company {
    cin: 'U65999MH2019PTC123456',
    name: 'Alpha Ventures Pvt Ltd',
    label: 'Alpha Ventures',
    status: 'Active',
    state: 'Maharashtra',
    incorporation_date: '01/04/2019',
    paid_up_capital_inr: 100000,
    flagged: true,
    node_type: 'company'
});

CREATE (c2:Company {
    cin: 'U74999MH2020PTC654321',
    name: 'Beta Holdings Pvt Ltd',
    label: 'Beta Holdings',
    status: 'Active',
    state: 'Maharashtra',
    incorporation_date: '15/06/2020',
    flagged: false,
    node_type: 'company'
});

CREATE (person1:Person {
    din: '00000001',
    name: 'Rajesh Kumar',
    label: 'Rajesh Kumar',
    flagged: true,
    node_type: 'person'
});

// Company relationships
MATCH (p:Person {din: '00000001'})
MATCH (c:Company {cin: 'U65999MH2019PTC123456'})
CREATE (p)-[:DIRECTOR_OF {date_of_appointment: '01/04/2019'}]->(c);

MATCH (a:Company {cin: 'U65999MH2019PTC123456'})
MATCH (b:Company {cin: 'U74999MH2020PTC654321'})
CREATE (a)-[:SUBSIDIARY {ownership_pct: 60}]->(b);

// ── Cross-layer links ─────────────────────────────────────
// Phone that controls the UPI also linked to shell company director
MATCH (ph:Phone {number: '9000000000'})
MATCH (p:Person {din: '00000001'})
CREATE (ph)-[:LINKED_TO {note: 'Same individual - cross-layer link'}]->(p);

// Return summary
MATCH (n) RETURN labels(n)[0] AS type, count(n) AS count ORDER BY count DESC;
