using RegistrationApi.Models;
using RegistrationApi.Services;
using Microsoft.AspNetCore.Mvc;

namespace RegistrationApi.Controllers;

[ApiController]
[Route("api/registrations")]
public class RegistrationsController(RegistrationService registrations) : ControllerBase
{
    // GET /api/registrations/{id}
    [HttpGet("{id:int}")]
    public ActionResult<RegistrationResponse> GetById(int id) =>
        registrations.Find(id) is { } account ? RegistrationResponse.From(account) : NotFound();

    [HttpPost]
    public IActionResult Register(RegisterRequest request) =>
        registrations.Register(request) switch
        {
            RegisterResult.Created created => CreatedAtAction(
                nameof(GetById),
                new { id = created.Account.Id },
                RegistrationResponse.From(created.Account)),
            RegisterResult.Invalid invalid => BadRequest(new { errors = invalid.Errors }),
            RegisterResult.Duplicate => Conflict(new
            {
                errors = new { email = new[] { "This email address is already registered." } },
            }),
            _ => throw new InvalidOperationException(),
        };
}
