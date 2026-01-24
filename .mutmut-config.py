"""
Mutmut configuration for mutation testing.

Mutation testing helps verify test quality by introducing
small changes (mutations) to the code and checking if tests catch them.
"""


def pre_mutation(context):
    """
    Hook called before each mutation.
    Can be used to skip certain mutations or log progress.
    """
    # Skip mutations in test files
    if 'test_' in context.filename:
        context.skip = True

    # Skip mutations in generated OpenAPI script
    if 'generate_openapi' in context.filename:
        context.skip = True


def post_mutation(context):
    """
    Hook called after each mutation.
    Can be used to log results or clean up.
    """
    pass
