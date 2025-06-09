export const getVault = async (
	vaultAddress: string,
	subgraphUrl: string
): Promise<any> => {
	const query = `
    {
 offchainAssetReceiptVault(id: "${vaultAddress.toLowerCase()}") {

    withdraws {
      id
       emitter {
        address
      }
      transaction {
        id
      }
      
      receipt {
        id
        receiptId
        receiptInformations {
        payload
          schema
          information
            payload
            schema
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    deposits {
      id
       emitter {
        address
      }
      transaction {
        id
      }
      receipt {
        id
        receiptId
        receiptInformations {
          payload
          schema
          information
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    activeAuthorizer {
      address
      rolesGranted(orderBy: timestamp, orderDirection: desc) {
        role {
          roleName
        }
        sender {
          address
        }
        account {
          address
        }
        timestamp
        transaction {
          id
        }
      }
      roleHolders {
        role {
          roleName
          roleHash
        }
        account {
          address
        }
      }
      roles(orderBy: roleName) {
        roleName
        roleHolders {
          account {
            address
          }
        }
        roleHash
      }
      roleRevokes {
        role {
          roleName
        }
        sender {
          address
        }
        account {
          address
        }
        timestamp
        transaction {
          id
        }
      }
    }
    
    id
    totalShares
    address
    deployer
    admin
    name
    symbol
    deployTimestamp
    receiptContractAddress
    shareHolders {
      address
    }
    
    tokenHolders {
      address
      balance
    }
    
    shareTransfers {
      id
      timestamp
      from {
        address
      }
      to {
        address
      }
      value
    }
    receiptBalances {
      receipt {
        shares
        id
        receiptId
        balances {
          valueExact
          value
          account {
            address
          }
        }
          deposits {
          amount
          receipt {
            receiptId
          }
          timestamp
        }
        receiptInformations(orderDirection: desc, orderBy: timestamp) {
          information
          id
          transaction {
            blockNumber
            id
          }
          timestamp
          emitter {
            address
          }
          receipt {
            deposits {
              amount
            }
          }
        }
      }
    }
    certifications(orderBy: timestamp, orderDirection: desc) {
      timestamp
      id
      certifier {
        address
      }
      certifiedUntil
      totalShares
      transaction {
        id
        blockNumber
      }
      data
      information
    }
    receiptVaultInformations(orderBy: timestamp, orderDirection: desc) {
      information
      id
      timestamp
      caller {
        address
      }
      transaction {
        blockNumber
      }
    }
  }
          }
    `;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});

	const json = await response.json();

	return json.data.offchainAssetReceiptVault;
};