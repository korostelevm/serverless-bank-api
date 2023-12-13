// Create clients and set shared const values outside of the handler.

// Create a DocumentClient that represents the query to add an item
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

export const balanceHandler = async (event, context) => {

    console.log(JSON.stringify({event, context},null,2))

    let user = event.requestContext.authorizer.claims['custom:username']
    let requested_account_name = event.pathParameters.account_name
    
    let q = {
        TableName: process.env.DB,
        KeyConditionExpression: "pk=:pk",
        FilterExpression: "account_name = :account_name",
        ExpressionAttributeValues: {
            ":pk": `user#${user}`,
            ":account_name": `${requested_account_name}`
        },
        
    }
    let accounts_query = await ddbDocClient.send(new QueryCommand(q))
    let accounts = accounts_query.Items

    if(!accounts.length){
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: `Account ${requested_account_name} not found for user ${user}`
            })
        }
    }

    let account = accounts_query.Items[0]

    let account_details = await ddbDocClient.send(new GetCommand({
        TableName: process.env.DB,
        Key: {
            pk: `account#${account.account_id}`,
            sk: account.account_id
        }
    }))
    
    account = account_details.Item
    

    let result = {
        partner: user,
        name: account.name,
        balance: account.balance,
    }


    const response = {
        statusCode: 200,
        body: JSON.stringify(result),
        headers: {
            "Content-Type": "application/json",
        }

    };

    return response;
}
