
.SILENT:
.PHONY: help
app_name=vendia-assessment

## Prints this help screen
help:
	echo "\nUsage: make [target]\n"
	awk '/^[a-zA-Z\-\_0-9]+:/ { \
		helpMessage = match(lastLine, /^## (.*)/); \
		if (helpMessage) { \
			helpCommand = substr($$1, 0, index($$1, ":")-1); \
			helpMessage = substr(lastLine, RSTART + 3, RLENGTH); \
			printf "%-15s %s\n", helpCommand, helpMessage; \
		} \
	} \
	{ lastLine = $$0 }' $(MAKEFILE_LIST)


## Create the base infrastructure for the application
init:
	sam deploy \
	--no-fail-on-empty-changeset \
	--no-confirm-changeset \
	--stack-name ${app_name}-base \
	--template-file ./account_infra/template.yaml \
	--parameter-overrides \
		AppName=${app_name} \
	--capabilities CAPABILITY_IAM  
	



install: 
	npm install

test: 
	curl -X POST \
		-H "Content-Type: application/x-amz-json-1.1" \
		-H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
		--data '{ \
			"AuthFlow": "USER_PASSWORD_AUTH", \
			"ClientId": "5lui55u51lglkg53n82ehlsv2u", \
			"AuthParameters": { \
				"USERNAME": "korostelevm@gmail.com", \
				"PASSWORD": "4234475a" \
			}\
		}' \
		"https://cognito-idp.us-east-2.amazonaws.com/"



build:
	@sam build \
		--cached \
		--template template.yaml

## Deploy the application
deploy:
	@$(eval app_bucket=$(shell aws cloudformation describe-stacks --stack-name ${app_name}-base --query 'Stacks[0].Outputs[?OutputKey==`AppBucket`].OutputValue' --output text) )
	sam deploy \
	--stack-name ${app_name} \
	--template-file ./template.yaml \
	--capabilities CAPABILITY_IAM \
	--s3-bucket ${app_bucket} 

sync:
	sam sync \
	--stack-name ${app_name} 