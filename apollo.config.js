module.exports = {
    client: {
        includes: ['./js-packages/graphql-queries/src/**/*.ts'],
        service: {
            name: 'local',
            url: 'http://localhost:8000/graphql',
            skipSSLValidation: true,
        },
    },
}
