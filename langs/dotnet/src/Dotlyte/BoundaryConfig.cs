namespace Dotlyte;

/// <summary>
/// Configuration boundary enforcement for server/client key isolation.
/// Prevents accidental leakage of server-only keys to client contexts.
/// </summary>
public sealed class BoundaryConfig
{
    private readonly Dictionary<string, object?> _data;
    private readonly HashSet<string> _serverKeys;
    private readonly HashSet<string> _clientKeys;
    private readonly HashSet<string> _sharedKeys;
    private readonly Action<string>? _onSecretAccess;

    /// <summary>
    /// Whether the current runtime is a server context.
    /// Always <c>true</c> in .NET.
    /// </summary>
    public bool IsServerContext => true;

    /// <summary>
    /// Initializes a new <see cref="BoundaryConfig"/> with boundary key sets.
    /// </summary>
    /// <param name="data">The full configuration dictionary.</param>
    /// <param name="serverKeys">Keys restricted to server contexts.</param>
    /// <param name="clientKeys">Keys allowed in client contexts.</param>
    /// <param name="sharedKeys">Keys allowed in both contexts.</param>
    /// <param name="onSecretAccess">Optional callback invoked when a server-only key is accessed.</param>
    public BoundaryConfig(
        Dictionary<string, object?> data,
        HashSet<string> serverKeys,
        HashSet<string> clientKeys,
        HashSet<string> sharedKeys,
        Action<string>? onSecretAccess = null)
    {
        _data = data ?? throw new ArgumentNullException(nameof(data));
        _serverKeys = serverKeys ?? throw new ArgumentNullException(nameof(serverKeys));
        _clientKeys = clientKeys ?? throw new ArgumentNullException(nameof(clientKeys));
        _sharedKeys = sharedKeys ?? throw new ArgumentNullException(nameof(sharedKeys));
        _onSecretAccess = onSecretAccess;
    }

    /// <summary>
    /// Get a configuration value with boundary enforcement.
    /// Server keys are accessible only in server contexts.
    /// </summary>
    /// <param name="key">The configuration key.</param>
    /// <returns>The configuration value, or <c>null</c> if not found.</returns>
    /// <exception cref="DotlyteException">Thrown when accessing a server key in a non-server context,
    /// or when the key is not registered in any boundary set.</exception>
    public object? Get(string key)
    {
        if (_serverKeys.Contains(key))
        {
            if (!IsServerContext)
            {
                throw new DotlyteException(
                    $"Cannot access server-only key '{key}' in a client context. " +
                    "Move this key to 'clientKeys' or 'sharedKeys' if client access is intended.",
                    key);
            }

            _onSecretAccess?.Invoke(key);
        }
        else if (!_clientKeys.Contains(key) && !_sharedKeys.Contains(key))
        {
            throw new DotlyteException(
                $"Key '{key}' is not registered in any boundary set (server, client, or shared). " +
                "Add it to the appropriate boundary set.",
                key);
        }

        _data.TryGetValue(key, out var value);
        return value;
    }

    /// <summary>
    /// Return a dictionary containing only server-boundary keys.
    /// </summary>
    /// <returns>A filtered dictionary with server-only and shared keys.</returns>
    public Dictionary<string, object?> ServerOnly()
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in _data)
        {
            if (_serverKeys.Contains(key) || _sharedKeys.Contains(key))
            {
                result[key] = value;
            }
        }
        return result;
    }

    /// <summary>
    /// Return a dictionary containing only client-boundary keys.
    /// </summary>
    /// <returns>A filtered dictionary with client-only and shared keys.</returns>
    public Dictionary<string, object?> ClientOnly()
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in _data)
        {
            if (_clientKeys.Contains(key) || _sharedKeys.Contains(key))
            {
                result[key] = value;
            }
        }
        return result;
    }
}
