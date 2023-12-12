// Create clients and set shared const values outside of the handler.

// Create a DocumentClient that represents the query to add an item
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand,
    TransactWriteCommand,
    UpdateCommand
 } from '@aws-sdk/lib-dynamodb';
 import { with_backoff } from './utils.mjs';
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

const do_transfer = async (source_account, destination_account, amount) => {
    let result = null
    let do_transfer = await ddbDocClient.send(new TransactWriteCommand({
        TransactItems : [
            {
                Update: {
                    ConditionExpression: "balance >= :amount",
                    TableName: process.env.DB,
                    Key: {
                        pk: source_account.account_id,
                        sk: source_account.account_id
                    },
                    UpdateExpression: "set balance = balance - :amount",
                    ExpressionAttributeValues: {
                        ":amount": amount
                    }
                }
            },
            {
                Update: {
                    TableName: process.env.DB,
                    Key: {
                        pk: destination_account.account_id,
                        sk: destination_account.account_id
                    },
                    UpdateExpression: "set balance = balance + :amount",
                    ExpressionAttributeValues: {
                        ":amount": amount
                    }
                }
            }
        ]
        
        
    }))
    return result
}


export const transferHandler = async (event, context) => {

    console.log(JSON.stringify({event, context},null,2))


    const user = event.requestContext.authorizer.claims['custom:username']
    const {source_account_name, destination_account_name, amount, partner} = JSON.parse(event.body)

    let error = null;
    let accounts_queries = [
            {partner: user, account_name: source_account_name},
            {partner: partner, account_name: destination_account_name},
        ].map(async (q) => {
            let qq = {
                TableName: process.env.DB,
                KeyConditionExpression: "pk=:pk",
                FilterExpression: "account_name = :account_name",
                ExpressionAttributeValues: {
                    ":pk": `${q.partner}`,
                    ":account_name": `${q.account_name}`
                },
            }

            let accounts = await ddbDocClient.send(new QueryCommand(qq))

            if(!accounts.Items.length){
                error = `Account ${q.account_name} not found for user ${q.partner}`
                return null
            }
        
            return accounts.Items[0]
    })
    let accounts = await Promise.all(accounts_queries)
    
    if(error){
        return {
            statusCode: 400,
            body: JSON.stringify({
                accounts,
                error
            })
        }
    }

    
    // transfer funds
    let source_account = accounts[0]
    let destination_account = accounts[1]

    let result
    try{
        await with_backoff(() => do_transfer(source_account, destination_account, amount))
    }catch(e){
        if(e.code == 'TransactionCanceledException'){
            return {
                statusCode: 423,
                body: JSON.stringify({
                    error: `Resource is busy, try again later`
                })
            }
        }
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: `Transfer failed`
            })
        }
    }


    const response = {
        statusCode: 200,
        body: JSON.stringify({
            result,
            error
        }),
        headers: {
            "Content-Type": "application/json",
        }

    };

    return response;
}
