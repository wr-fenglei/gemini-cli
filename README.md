# Notice
This project is a fork from [an effort to add openai/deepseek provider to gemini-cli](https://github.com/wr-fenglei/gemini-cli). This project goes one step forward: it adds Azure OpenAI provider.

# Documentation
See gemini-cli official docs [here](https://github.com/google-gemini/gemini-cli).

# How to use Azure OpenAI
1. clone this project.
2. cd the project folder.
3. npm install
4. npm run build
5. npm install -g .
6. set required environment variables:
```powershell
$env:AZURE_OPENAI_API_KEY=''
$env:AZURE_OPENAI_BASE_URL=''
```
7. gemini

# Known Issues
1. The Azure OpenAI response format is not fully compatible with OpenAI-like API, so you may see JSON deserialization error, but it does not prevent the tool from running.